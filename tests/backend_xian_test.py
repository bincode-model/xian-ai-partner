"""Regression cases for the new Xi'an file workflows, including bad source data."""
import json
import unittest
from datetime import date
from decimal import Decimal
from server import pipelines

class XianWorkflows(unittest.TestCase):
    def run_flow(self,domain,text=None):
        checked=pipelines.validate(domain,pipelines.parse(text or pipelines.sample(domain)['text']),date(2026,9,29))
        state=pipelines.normalize(domain,checked)
        analysis=pipelines.analyze(domain,state,date(2026,9,29))
        return state,analysis,{name:content for name,_,content in pipelines.build(domain,state,analysis)}

    def test_government_missing_docs_and_department_load(self):
        state,a,files=self.run_flow('government')
        self.assertEqual(a['missing_document_cases'],1)
        self.assertEqual(a['department_load'],{'示例综合窗口':2})
        self.assertEqual(state['rows'][0]['missing_docs'],['经营说明'])
        self.assertIn('审批',a['limitations'])
        self.assertIn('事项补件清单.csv',files)
        self.assertEqual(len(json.loads(files['待办与验收.json'])['tasks']),2)

    def test_government_empty_provided_docs_is_missing_not_bad_row(self):
        row=dict(zip(pipelines.SCHEMAS['government'],pipelines.SAMPLE_ROWS['government'][0]));row['provided_docs']=''
        state,a,_=self.run_flow('government',json.dumps([row]))
        self.assertEqual(state['excluded'],0)
        self.assertEqual(len(state['rows'][0]['missing_docs']),2)

    def test_government_conflicting_ids_are_quarantined(self):
        rows=[dict(zip(pipelines.SCHEMAS['government'],r)) for r in pipelines.SAMPLE_ROWS['government']]
        rows.append({**rows[0],'owner_department':'不同部门'})
        state,a,_=self.run_flow('government',json.dumps(rows))
        self.assertEqual(state['excluded'],2)
        self.assertEqual(a['valid_records'],2)

    def test_agriculture_quantities_and_date_reminders(self):
        _,a,files=self.run_flow('agriculture')
        self.assertEqual(a['quantity_kg'],Decimal(2100))
        self.assertEqual(a['available_kg'],Decimal(1000))
        self.assertEqual(a['past_delivery_date_batches'],0)
        self.assertIn('产地批次余量.csv',files)
        self.assertIn('未发货',files['待办与验收.json'])

    def test_agriculture_overallocated_and_reverse_dates_excluded(self):
        rows=[dict(zip(pipelines.SCHEMAS['agriculture'],r)) for r in pipelines.SAMPLE_ROWS['agriculture']]
        rows[0]['allocated_kg']='1201';rows[1]['delivery_date']='2026-08-01'
        state,a,_=self.run_flow('agriculture',json.dumps(rows))
        self.assertEqual(state['excluded'],2)
        self.assertEqual(a['available_kg'],Decimal(0))

    def test_agriculture_duplicate_conflict_not_silently_aggregated(self):
        rows=[dict(zip(pipelines.SCHEMAS['agriculture'],r)) for r in pipelines.SAMPLE_ROWS['agriculture']]
        rows.append({**rows[0],'quantity_kg':'1500'})
        state,a,_=self.run_flow('agriculture',json.dumps(rows))
        self.assertEqual(state['excluded'],2)
        self.assertEqual(a['quantity_kg'],Decimal(900))
