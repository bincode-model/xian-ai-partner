"""Meaningful standard-library regression suite; never calls real paid providers."""
from __future__ import annotations

import base64
import csv
import http.client
import io
import json
import tempfile
import threading
import time
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

from server import pipelines
from server.main import LocalHTTPServer, MAX_BODY
from server.service import APIError, MAX_FILE_BYTES, Service, Store


class PipelineTests(unittest.TestCase):
    def pipeline(self, domain, text=None):
        parsed = pipelines.parse(text or pipelines.sample(domain)["text"])
        checked = pipelines.validate(domain, parsed, date(2026, 9, 27))
        normalized = pipelines.normalize(domain, checked)
        analysis = pipelines.analyze(domain, normalized, date(2026, 9, 27))
        files = pipelines.build(domain, normalized, analysis)
        return checked, analysis, {name: text for name, _, text in files}

    def test_all_six_real_artifacts_have_domain_content(self):
        expected = {"drug": "候选证据矩阵.csv", "industry": "缺陷分布.csv", "ecommerce": "四平台商品草稿.csv", "finance": "应收账龄明细.csv", "tourism": "分区路线草稿.csv", "employment": "岗位技能缺口.csv"}
        for domain, artifact in expected.items():
            with self.subTest(domain=domain):
                checked, analysis, files = self.pipeline(domain)
                self.assertEqual(len(checked["rows"]), 3)
                self.assertIn(artifact, files)
                self.assertIn("待人工复核", files["业务报告-待复核.md"])
                self.assertEqual(json.loads(files["分析与数据质量.json"])["domain"], domain)
                self.assertTrue(json.loads(files["待办与验收.json"])["review_required"])
                self.assertGreaterEqual(len(files), 4)

    def test_finance_uses_decimal_correct_aging(self):
        _, analysis, files = self.pipeline("finance")
        self.assertEqual(str(analysis["outstanding"]), "14500.00")
        self.assertEqual(str(analysis["total_received"]), "11000.00")
        self.assertEqual(str(analysis["aging"]["61_90"]), "9000.00")
        self.assertEqual(str(analysis["aging"]["1_30"]), "5500.00")
        self.assertEqual(analysis["largest_customer_share_percent"], 100.0)
        self.assertIn("2026-09-27", files["业务报告-待复核.md"])

    def test_industry_quantities_and_unresolved_priorities(self):
        _, analysis, files = self.pipeline("industry")
        self.assertEqual(analysis["defect_units"], 20)
        self.assertEqual(analysis["unresolved_units"], 15)
        tasks = json.loads(files["待办与验收.json"])["tasks"]
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks[0]["priority"], "critical")
        self.assertIn("85.0", files["缺陷分布.csv"])

    def test_ecommerce_twelve_drafts_and_zero_stock(self):
        _, analysis, files = self.pipeline("ecommerce")
        drafts = list(csv.DictReader(io.StringIO(files["四平台商品草稿.csv"].lstrip("\ufeff"))))
        self.assertEqual(len(drafts), 12)
        self.assertEqual(set(r["platform"] for r in drafts), {"淘宝", "天猫", "抖音", "拼多多"})
        self.assertTrue(all("未发布" in r["status"] for r in drafts))
        self.assertEqual(analysis["out_of_stock"], 1)
        self.assertIn("库存为零", drafts[-1]["review_checks"])

    def test_drug_no_cross_target_ranking_and_flags(self):
        _, analysis, files = self.pipeline("drug")
        self.assertEqual(analysis["targets"], 2)
        self.assertEqual(analysis["safety_flags"], 1)
        self.assertIn("不可直接横向排名", analysis["limitations"])
        tasks = json.loads(files["待办与验收.json"])["tasks"]
        self.assertIn("暂停推进", tasks[1]["task"])
        self.assertIn("未进行实验", pipelines.summary("drug", {"rows": [1, 2, 3], "excluded": 0}, analysis, len(files)))

    def test_tourism_excludes_impossible_visit_and_uses_separate_days(self):
        rows = [dict(zip(pipelines.SCHEMAS["tourism"], r)) for r in pipelines.SAMPLE_ROWS["tourism"]]
        rows[0]["close_time"] = "09:30"
        checked, analysis, files = self.pipeline("tourism", json.dumps(rows, ensure_ascii=False))
        self.assertEqual(len(checked["rows"]), 3)
        self.assertEqual(analysis["scheduled_spots"], 2)
        self.assertEqual(analysis["skipped"][0]["spot_id"], "SYN-T001")
        self.assertIn("独立一天", files["业务报告-待复核.md"])
        self.assertIn("15 分钟", analysis["limitations"])

    def test_employment_gap_tasks_do_not_inflate_people(self):
        _, analysis, files = self.pipeline("employment")
        self.assertEqual(len(analysis["people"]), 2)
        self.assertEqual(analysis["gap_records"], 2)
        self.assertEqual(analysis["total_gap"], 3)
        tasks = json.loads(files["待办与验收.json"])["tasks"]
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks[0]["gap"], 2)
        self.assertIn("未验收前不提升", tasks[0]["acceptance"])

    def test_invalid_rows_excluded_with_source_and_not_silently_counted(self):
        text = pipelines.sample("ecommerce")["text"] + "BAD,错误商品,陕西,水果,-1,2,内容\nSYN-SKU01,重复,陕西,水果,4,2,内容\n"
        checked, analysis, files = self.pipeline("ecommerce", text)
        self.assertEqual(checked["total"], 5)
        self.assertEqual(checked["excluded"], 3)
        self.assertEqual(len(checked["issues"]), 3)
        self.assertEqual(analysis["drafts"], 8)
        self.assertIn("第 5 行", files["业务报告-待复核.md"])
        self.assertIn("重复 ID", files["业务报告-待复核.md"])

    def test_json_arrays_and_rows_object_supported(self):
        rows = [dict(zip(pipelines.SCHEMAS["ecommerce"], r)) for r in pipelines.SAMPLE_ROWS["ecommerce"]]
        a = self.pipeline("ecommerce", json.dumps(rows, ensure_ascii=False))[1]
        b = self.pipeline("ecommerce", json.dumps({"rows": rows}, ensure_ascii=False))[1]
        self.assertEqual(a, b)

    def test_malformed_structures_and_unusable_files_fail(self):
        for text in ["", "a,a\n1,2", "a,b\n1,2,3", "a,b\n1", '{"rows": [5]}', "[NaN]", '{"rows": [{"a": {"nested": 1}}]}']:
            with self.subTest(text=text), self.assertRaises(pipelines.InputError):
                pipelines.parse(text)
        with self.assertRaisesRegex(pipelines.InputError, "缺少必需字段"):
            self.pipeline("drug", "name\nabc")
        rows = [dict(zip(pipelines.SCHEMAS["industry"], pipelines.SAMPLE_ROWS["industry"][0]))]
        rows[0]["quantity"] = "1.5"
        with self.assertRaisesRegex(pipelines.InputError, "所有记录"):
            self.pipeline("industry", json.dumps(rows))

    def test_csv_formula_quarantined_and_markdown_html_escaped(self):
        rows = [dict(zip(pipelines.SCHEMAS["employment"], pipelines.SAMPLE_ROWS["employment"][0]))]
        rows[0]["name"] = '=HYPERLINK("https://evil.test")'
        rows[0]["skill"] = "<script>alert(1)</script>"
        _, _, files = self.pipeline("employment", json.dumps(rows))
        self.assertIn("'=HYPERLINK", files["岗位技能缺口.csv"])
        self.assertNotIn("<script>", files["业务报告-待复核.md"])
        self.assertIn("&lt;script&gt;", files["业务报告-待复核.md"])

    def test_conflicting_invoice_ids_all_quarantined_independent_of_order(self):
        rows = [dict(zip(pipelines.SCHEMAS["finance"], r)) for r in pipelines.SAMPLE_ROWS["finance"]]
        conflict = {**rows[0], "amount": "99000.00"}
        for inputs in [[rows[0], conflict, rows[2]], [conflict, rows[0], rows[2]]]:
            checked, analysis, _ = self.pipeline("finance", json.dumps(inputs))
            self.assertEqual(checked["excluded"], 2)
            self.assertEqual(str(analysis["outstanding"]), "5500.00")
            self.assertTrue(all("全部记录已隔离" in issue for issue in checked["issues"]))
        # Exact duplicates retain one source record instead of double-counting.
        checked, analysis, _ = self.pipeline("finance", json.dumps([rows[0], rows[0]]))
        self.assertEqual(checked["excluded"], 1)
        self.assertEqual(str(analysis["outstanding"]), "9000.00")

    def test_future_invoices_excluded_and_no_foreign_currency_mislabel(self):
        rows = [dict(zip(pipelines.SCHEMAS["finance"], r)) for r in pipelines.SAMPLE_ROWS["finance"]]
        future = {**rows[0], "invoice_id": "FUTURE", "invoice_date": "2027-01-01", "due_date": "2027-02-01"}
        usd = {**rows[0], "invoice_id": "USD", "currency": "USD"}
        checked, analysis, files = self.pipeline("finance", json.dumps([future, usd, rows[2]]))
        self.assertEqual(checked["excluded"], 2)
        self.assertEqual(str(analysis["outstanding"]), "5500.00")
        self.assertTrue(any("晚于业务日期" in issue for issue in checked["issues"]))
        self.assertTrue(any("非 CNY" in issue for issue in checked["issues"]))
        self.assertEqual(analysis["assumed_currency_records"], 1)
        self.assertIn("币种假设：1 条", files["业务报告-待复核.md"])
        _, explicit, _ = self.pipeline("finance", json.dumps([{**rows[2], "currency": "CNY"}]))
        self.assertEqual(explicit["assumed_currency_records"], 0)

    def test_pending_drug_unmeasured_affinity_remains_missing(self):
        row = dict(zip(pipelines.SCHEMAS["drug"], pipelines.SAMPLE_ROWS["drug"][1]))
        row["affinity_nm"] = ""
        checked, analysis, files = self.pipeline("drug", json.dumps([row]))
        self.assertIsNone(checked["rows"][0]["affinity_nm"])
        self.assertEqual(analysis["unmeasured_affinity_records"], 1)
        self.assertIn("没有补零", files["业务报告-待复核.md"])
        values = list(csv.DictReader(io.StringIO(files["候选证据矩阵.csv"].lstrip("\ufeff"))))
        self.assertEqual(values[0]["affinity_nm"], "")

    def test_business_date_is_shanghai_at_utc_midnight_boundary(self):
        real = datetime(2026, 9, 26, 18, 30, tzinfo=timezone.utc)
        with mock.patch("server.pipelines.datetime") as clock:
            clock.now.side_effect = lambda tz: real.astimezone(tz)
            self.assertEqual(pipelines.business_today(), date(2026, 9, 27))


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(self.tmp.name)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def create(self, domain="ecommerce", key="test-key-123", **extra):
        return self.store.create_run({"domain_id": domain, "title": "测试任务", "input_text": pipelines.sample(domain)["text"], "idempotency_key": key, **extra})

    def test_idempotency_same_payload_once_different_conflict(self):
        first = self.create()
        second = self.create()
        self.assertEqual(first["id"], second["id"])
        with self.assertRaises(APIError) as ctx:
            self.create(title="不同内容")
        self.assertEqual(ctx.exception.status, 409)
        self.assertEqual(self.store.state({})["metrics"]["total_runs"], 1)

    def test_atomic_claim_under_concurrent_workers(self):
        for idx in range(30):
            self.create(key=f"batch-{idx:04d}")
        ids, lock = [], threading.Lock()
        def worker():
            while run := self.store.claim():
                with lock:
                    ids.append(run["id"])
        threads = [threading.Thread(target=worker) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(len(ids), 30)
        self.assertEqual(len(set(ids)), 30)

    def test_cancel_retry_and_review_state_rules(self):
        run = self.create()
        with self.assertRaises(APIError):
            self.store.review(run["id"], {"decision": "approve", "note": ""})
        self.assertEqual(self.store.cancel(run["id"])["status"], "cancelled")
        with self.assertRaises(APIError):
            self.store.cancel(run["id"])
        retried = self.store.retry(run["id"])
        self.assertNotEqual(retried["id"], run["id"])
        self.assertEqual(retried["parent_id"], run["id"])
        self.assertEqual(retried["input_text"], run["input_text"])
        claimed = self.store.claim()
        self.store.update_progress(claimed["id"], status="awaiting_review")
        with self.assertRaises(APIError):
            self.store.review(claimed["id"], {"decision": "reject", "note": ""})
        self.assertEqual(self.store.review(claimed["id"], {"decision": "reject", "note": "补充真实规格"})["status"], "needs_revision")
        retry2 = self.store.retry(claimed["id"])
        self.store.claim()
        self.store.update_progress(retry2["id"], status="awaiting_review")
        self.assertEqual(self.store.review(retry2["id"], {"decision": "approve", "note": "已核对"})["status"], "completed")
        with self.assertRaises(APIError):
            self.store.retry(retry2["id"])

    def test_recovery_marks_interrupted_runs_and_preserves_queued(self):
        first = self.create(key="first-12345")
        second = self.create(key="second-1234")
        self.store.claim()
        self.store.step(first["id"], 0, "running", "读取")
        self.store.close()
        self.store = Store(self.tmp.name)
        self.store.recover()
        recovered = self.store.get_run(first["id"])
        self.assertEqual(recovered["status"], "failed")
        self.assertEqual(recovered["steps"][0]["status"], "failed")
        self.assertIn("中断", recovered["error"])
        self.assertEqual(self.store.get_run(second["id"])["status"], "queued")

    def test_schedule_dispatch_persistent_atomic_coalesced_disabled_delete(self):
        schedule = self.store.entity("schedules", {"name": "库存核对", "domain_id": "ecommerce", "input_text": pipelines.sample("ecommerce")["text"], "interval_minutes": 5, "enabled": True})
        due = schedule["next_run_at"]
        self.assertEqual(len(self.store.dispatch_due(due)), 1)
        self.assertEqual(len(self.store.dispatch_due(due)), 0)
        self.store.close()
        self.store = Store(self.tmp.name)
        saved = self.store.list_entities("schedules")[0]
        self.assertIsNotNone(saved["last_run_id"])
        self.assertEqual(len(self.store.dispatch_due(due)), 0)
        self.assertEqual(len(self.store.dispatch_due("2099-01-01T00:00:00.000Z")), 1)
        self.assertEqual(self.store.state({})["metrics"]["total_runs"], 2)
        self.store.entity("schedules", {"enabled": False}, schedule["id"])
        self.assertEqual(len(self.store.dispatch_due("2099-01-01T01:00:00.000Z")), 0)
        self.store.entity("schedules", {}, schedule["id"], delete=True)
        self.assertEqual(self.store.list_entities("schedules"), [])

    def test_upload_limits_unicode_original_and_path_protection(self):
        raw = pipelines.sample("drug")["text"].encode("utf-8")
        upload = self.store.upload({"filename": "合成研究.csv", "content_base64": base64.b64encode(raw).decode()})
        self.assertEqual(upload["size"], len(raw))
        self.assertEqual(self.store.resolve_input({"upload_id": upload["id"]}), raw.decode())
        for name in ["../leak.csv", "/tmp/leak.csv", "a\\b.csv", "hidden.exe", ".secret.txt", "line\n.csv"]:
            with self.subTest(name=name), self.assertRaises(APIError):
                self.store.upload({"filename": name, "content_base64": "YQ=="})
        for content in ["@@", base64.b64encode(b"\xff\xff").decode(), base64.b64encode(b"x\x00y").decode(), ""]:
            with self.subTest(content=content), self.assertRaises(APIError):
                self.store.upload({"filename": "x.txt", "content_base64": content})
        with self.assertRaises(APIError):
            self.store.upload({"filename": "big.txt", "content_base64": base64.b64encode(b"x" * (MAX_FILE_BYTES + 1)).decode()})
        with self.assertRaises(APIError):
            self.store.resolve_input({"input_text": "x", "upload_id": upload["id"]})
        with self.assertRaises(APIError):
            self.store.download("../../anything")

    def test_member_agent_crud_and_real_case_handoffs(self):
        member = self.store.entity("members", {"name": "甲", "domain_id": "ecommerce", "department": "运营", "role": "商品专员", "skill_ids": ["EC-01", "EC-01"]})
        self.assertEqual(member["skill_ids"], ["EC-01"])
        agent = self.store.entity("agents", {"name": "整理助手", "domain_id": "ecommerce", "department": "运营", "role": "资料整理", "skill_ids": ["EC-01"], "enabled": True})
        self.assertFalse(self.store.entity("agents", {"enabled": False}, agent["id"])["enabled"])
        run = self.create()
        case = self.store.case({"title": "产品上架资料补齐", "domain_id": "ecommerce", "requester": "示例工厂", "department": "运营", "description": "核对商品资料", "assignee_id": member["id"], "run_id": run["id"], "status": "open"})
        case = self.store.case({"department": "内容复核", "status": "in_progress"}, case["id"])
        self.assertIn("运营 → 内容复核", case["notes"][-1]["text"])
        self.assertIn("open → in_progress", case["notes"][-1]["text"])
        case = self.store.case({"text": "已收到授权商品资料"}, case["id"], append_note=True)
        self.assertEqual(case["notes"][-1]["text"], "已收到授权商品资料")
        with self.assertRaises(APIError):
            self.store.case({"domain_id": "drug"}, case["id"])
        with self.assertRaises(APIError):
            self.store.case({"run_id": "a" * 32}, case["id"])
        self.store.case({}, case["id"], delete=True)
        self.assertEqual(self.store.list_entities("cases"), [])
        self.store.entity("members", {}, member["id"], delete=True)
        self.assertEqual(self.store.list_entities("members"), [])
        with self.assertRaises(APIError):
            self.store.entity("members", {"name": "替换"}, member["id"])

    def test_skill_assignments_reject_unknown_and_other_domain_ids(self):
        data = {"name": "商品专员", "domain_id": "ecommerce", "department": "运营", "role": "整理", "skill_ids": ["does-not-exist"]}
        with self.assertRaisesRegex(APIError, "不在当前目录"):
            self.store.entity("members", data)
        with self.assertRaisesRegex(APIError, "所属领域不一致"):
            self.store.entity("agents", {**data, "skill_ids": ["DRUG-001"]})
        member = self.store.entity("members", {**data, "skill_ids": ["EC-01"]})
        self.assertEqual(member["skill_ids"], ["EC-01"])

    def test_member_changes_keep_case_assignment_consistent(self):
        member = self.store.entity("members", {"name": "甲", "domain_id": "ecommerce", "department": "运营", "role": "商品专员", "skill_ids": []})
        case = self.store.case({"title": "交接", "domain_id": "ecommerce", "requester": "测试", "department": "运营", "description": "资料核查", "assignee_id": member["id"]})
        with self.assertRaises(APIError) as ctx:
            self.store.entity("members", {"domain_id": "drug"}, member["id"])
        self.assertEqual(ctx.exception.status, 409)
        with self.assertRaisesRegex(APIError, "所属部门") as ctx:
            self.store.entity("members", {"department": "内容审核"}, member["id"])
        self.assertEqual(ctx.exception.status, 409)
        unchanged = self.store.list_entities("members")[0]
        self.assertEqual(unchanged["department"], "运营")
        self.store.entity("members", {}, member["id"], delete=True)
        after = self.store.list_entities("cases")[0]
        self.assertEqual(after["id"], case["id"])
        self.assertIsNone(after["assignee_id"])
        self.assertIn("需重新分派", after["notes"][-1]["text"])

    def test_review_preserves_execution_finished_at_and_records_review_time(self):
        for idx, decision in enumerate(["approve", "reject"]):
            with self.subTest(decision=decision):
                run = self.create(key=f"review-time-{idx:04d}")
                self.store.claim()
                execution_finished = "2026-09-27T01:02:03.004Z"
                self.store.update_progress(run["id"], status="awaiting_review", finished_at=execution_finished)
                with mock.patch("server.service.now", return_value="2026-09-27T02:10:00.000Z"):
                    reviewed = self.store.review(run["id"], {"decision": decision, "note": "人工复核意见"})
                self.assertEqual(reviewed["finished_at"], execution_finished)
                self.assertEqual(reviewed["reviewed_at"], "2026-09-27T02:10:00.000Z")

    def test_member_can_change_department_after_case_handoff(self):
        member = self.store.entity("members", {"name": "甲", "domain_id": "ecommerce", "department": "运营", "role": "商品专员", "skill_ids": []})
        case = self.store.case({"title": "待交接", "domain_id": "ecommerce", "requester": "测试", "department": "运营", "description": "核查", "assignee_id": member["id"]})
        self.store.case({"assignee_id": None}, case["id"])
        moved = self.store.entity("members", {"department": "内容审核"}, member["id"])
        self.assertEqual(moved["department"], "内容审核")


class WorkerTests(unittest.TestCase):
    def test_real_two_worker_processing_and_cancel_at_stage_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = Service(tmp, workers=2)
            entered, release = threading.Event(), threading.Event()
            active, lock = [], threading.Lock()
            original_build = pipelines.build
            def held_build(domain, *args):
                with lock:
                    active.append(domain)
                    if len(active) == 2:
                        entered.set()
                release.wait(timeout=4)
                return original_build(domain, *args)
            try:
                with mock.patch("server.pipelines.build", side_effect=held_build):
                    first = service.store.create_run({"domain_id": "drug", "title": "并发药研", "input_text": pipelines.sample("drug")["text"], "idempotency_key": "worker-first-001"})
                    second = service.store.create_run({"domain_id": "industry", "title": "并发工业", "input_text": pipelines.sample("industry")["text"], "idempotency_key": "worker-second-001"})
                    service.wake.set()
                    self.assertTrue(entered.wait(timeout=3), "two workers did not enter real pipeline concurrently")
                    service.store.cancel(first["id"])
                    release.set()
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline and service.store.get_run(second["id"])["status"] == "running":
                        time.sleep(0.01)
                    self.assertEqual(service.store.get_run(second["id"])["status"], "awaiting_review")
                    cancelled = service.store.get_run(first["id"])
                    self.assertEqual(cancelled["status"], "cancelled")
                    self.assertEqual(cancelled["artifacts"], [])
            finally:
                release.set()
                service.close()

    def test_provider_calls_are_serialized_without_real_provider(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = Service(tmp, start_workers=False)
            service.codex = "/mock/not-executed"
            first_entered, release = threading.Event(), threading.Event()
            count, peak, lock = 0, 0, threading.Lock()
            def fake_provider(run, files):
                nonlocal count, peak
                with lock:
                    count += 1
                    peak = max(peak, count)
                    first_entered.set()
                release.wait(timeout=2)
                with lock:
                    count -= 1
            runs = []
            for i in range(2):
                service.store.create_run({"domain_id": "drug", "title": "串行模型验证", "input_text": pipelines.sample("drug")["text"], "idempotency_key": f"model-serial-{i}", "ai_enabled": True})
                runs.append(service.store.claim())
            try:
                with mock.patch.object(service, "_ai_draft", side_effect=fake_provider):
                    threads = [threading.Thread(target=service.ai_draft, args=(run, [])) for run in runs]
                    for thread in threads:
                        thread.start()
                    self.assertTrue(first_entered.wait(timeout=1))
                    release.set()
                    for thread in threads:
                        thread.join(timeout=3)
                        self.assertFalse(thread.is_alive())
                self.assertEqual(peak, 1)
            finally:
                release.set()
                service.close()

    def test_codex_uses_isolated_cwd_safe_flags_and_reports_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = Service(tmp, start_workers=False)
            service.codex = "/mock/not-executed"
            run = service.store.create_run({"domain_id": "drug", "title": "模型隔离验证", "input_text": pipelines.sample("drug")["text"], "idempotency_key": "model-isolation-01", "ai_enabled": True})
            run = service.store.claim()
            process = mock.Mock()
            process.poll.return_value = 5
            process.returncode = 5
            process.stdin = None
            try:
                with mock.patch("server.service.subprocess.Popen", return_value=process) as popen:
                    with self.assertRaisesRegex(RuntimeError, "退出码 5"):
                        service.ai_draft(run, [("report.md", "text/markdown", "合成报告")])
                    command = popen.call_args.args[0]
                    cwd = Path(popen.call_args.kwargs["cwd"])
                    self.assertIn("--ignore-user-config", command)
                    self.assertIn("read-only", command)
                    self.assertIn("mcp_servers={}", command)
                    self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", command)
                    self.assertNotIn("--ignore-rules", command)
                    self.assertNotIn("--dangerously-bypass-hook-trust", command)
                    self.assertNotEqual(cwd, Path(tmp))
                    self.assertFalse(cwd.exists(), "temporary model workspace should be removed")
            finally:
                service.close()


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dist = Path(cls.tmp.name) / "dist"
        cls.dist.mkdir()
        (cls.dist / "index.html").write_text("<html>local workbench</html>", encoding="utf-8")
        cls.service = Service(Path(cls.tmp.name) / "data", workers=3)
        cls.service.codex = None  # Tests never consume credits or access provider accounts.
        cls.http = LocalHTTPServer(0, cls.service, cls.dist, quiet=True)
        cls.port = cls.http.server_address[1]
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()
        cls.service.close()
        cls.tmp.cleanup()

    def request(self, method, path, data=None, headers=None, raw=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        body = raw if raw is not None else json.dumps(data, ensure_ascii=False).encode() if data is not None else None
        h = {"Content-Type": "application/json", **(headers or {})}
        connection.request(method, path, body=body, headers=h)
        response = connection.getresponse()
        result = response.read()
        response_headers = dict(response.getheaders())
        status = response.status
        connection.close()
        if result and response_headers.get("Content-Type", "").startswith("application/json"):
            result = json.loads(result)
        return status, result, response_headers

    def wait_run(self, run_id):
        limit = time.monotonic() + 5
        while time.monotonic() < limit:
            _, run, _ = self.request("GET", "/api/runs/" + run_id)
            if run["status"] not in {"queued", "running"}:
                return run
            time.sleep(0.02)
        self.fail("Pipeline did not finish within five seconds")

    def test_six_end_to_end_download_approve_and_metrics(self):
        for domain in pipelines.DOMAINS:
            with self.subTest(domain=domain):
                status, sample, _ = self.request("GET", "/api/samples/" + domain)
                self.assertEqual(status, 200)
                self.assertIn("合成", sample["description"])
                status, run, _ = self.request("POST", "/api/runs", {"domain_id": domain, "title": "端到端合成验证", "input_text": sample["text"], "idempotency_key": "http-six-" + domain})
                self.assertEqual(status, 201)
                result = self.wait_run(run["id"])
                self.assertEqual(result["status"], "awaiting_review", result.get("error"))
                self.assertEqual(len(result["steps"]), 7)
                self.assertTrue(all(step["status"] == "completed" for step in result["steps"]))
                for artifact in result["artifacts"]:
                    status, content, headers = self.request("GET", artifact["download_url"])
                    self.assertEqual(status, 200)
                    if isinstance(content, bytes):
                        self.assertGreater(len(content), 50)
                        self.assertEqual(len(content), artifact["size"])
                    self.assertIn("attachment", headers["Content-Disposition"])
                    self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
                status, reviewed, _ = self.request("POST", "/api/runs/" + run["id"] + "/review", {"decision": "approve", "note": "合成样例内容核算完成"})
                self.assertEqual(status, 200)
                self.assertEqual(reviewed["status"], "completed")
        _, state, _ = self.request("GET", "/api/state")
        self.assertGreaterEqual(state["metrics"]["completed_runs"], 6)
        self.assertGreaterEqual(state["metrics"]["artifacts_count"], 24)

    def test_invalid_file_and_optional_ai_failure_visible(self):
        for key, text, enabled in [("invalid-file-01", "bad\nrow", False), ("provider-none-01", pipelines.sample("drug")["text"], True)]:
            _, run, _ = self.request("POST", "/api/runs", {"domain_id": "drug", "title": "失败验证", "input_text": text, "idempotency_key": key, "ai_enabled": enabled})
            result = self.wait_run(run["id"])
            self.assertEqual(result["status"], "failed")
            self.assertTrue(result["error"])
            self.assertTrue(any(s["status"] == "failed" for s in result["steps"]))
            if enabled:
                self.assertIn("Codex CLI", result["error"])
                self.assertGreaterEqual(len(result["artifacts"]), 4)

    def test_loopback_origin_and_host_security(self):
        status, health, _ = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(health["ok"])
        for headers in [{"Host": "evil.test"}, {"Origin": "https://evil.test"}, {"Origin": "null"}, {"Sec-Fetch-Site": "cross-site"}]:
            with self.subTest(headers=headers):
                status, _, _ = self.request("GET", "/api/state", headers=headers)
                self.assertEqual(status, 403)
        status, _, headers = self.request("OPTIONS", "/api/runs", headers={"Origin": "http://localhost:5187"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5187")

    def test_request_validation_and_static_path_protection(self):
        self.assertEqual(self.request("POST", "/api/runs", raw=b"{}", headers={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request("POST", "/api/runs", raw=b"not json")[0], 400)
        self.assertEqual(self.request("POST", "/api/runs", raw=b"[]")[0], 400)
        self.assertEqual(self.request("POST", "/api/runs", {"domain_id": "not-real"})[0], 400)
        self.assertEqual(self.request("GET", "/%2e%2e/server/service.py")[0], 403)
        self.assertEqual(self.request("GET", "/api/artifacts/%2e%2e%2fsecret")[0], 404)
        self.assertEqual(self.request("GET", "/unknown-route")[0], 200)
        self.assertEqual(self.request("GET", "/missing.js")[0], 404)
        self.assertEqual(self.request("GET", "/api/unknown")[0], 404)
        # A malicious oversized length is rejected before attempting to read it.
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.putrequest("POST", "/api/uploads")
        conn.putheader("Content-Type", "application/json")
        conn.putheader("Content-Length", str(MAX_BODY + 1))
        conn.endheaders()
        response = conn.getresponse()
        self.assertEqual(response.status, 413)
        response.read()
        conn.close()

    def test_cross_site_top_level_app_navigation_only(self):
        navigation = {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"}
        self.assertEqual(self.request("GET", "/", headers=navigation)[0], 200)
        self.assertEqual(self.request("GET", "/workbench", headers=navigation)[0], 200)
        self.assertEqual(self.request("HEAD", "/", headers=navigation)[0], 200)
        self.assertEqual(self.request("GET", "/api/state", headers=navigation)[0], 403)
        self.assertEqual(self.request("GET", "/api", headers=navigation)[0], 403)
        self.assertEqual(self.request("GET", "/%61pi/state", headers=navigation)[0], 403)
        self.assertEqual(self.request("POST", "/", {}, headers=navigation)[0], 403)
        self.assertEqual(self.request("POST", "/api/runs", {}, headers=navigation)[0], 403)
        self.assertEqual(self.request("GET", "/", headers={**navigation, "Sec-Fetch-Dest": "iframe"})[0], 403)
        self.assertEqual(self.request("GET", "/", headers={**navigation, "Sec-Fetch-Mode": "cors"})[0], 403)
        self.assertEqual(self.request("GET", "/", headers={**navigation, "Origin": "https://evil.test"})[0], 403)
        self.assertEqual(self.request("GET", "/", headers={**navigation, "Host": "evil.test"})[0], 403)

    def test_upload_to_run_and_case_routes(self):
        sample = pipelines.sample("ecommerce")["text"]
        _, upload, _ = self.request("POST", "/api/uploads", {"filename": "商品.csv", "content_base64": base64.b64encode(sample.encode()).decode()})
        status, run, _ = self.request("POST", "/api/runs", {"domain_id": "ecommerce", "title": "上传执行", "upload_id": upload["id"], "idempotency_key": "upload-to-run-01"})
        self.assertEqual(status, 201)
        self.assertEqual(self.wait_run(run["id"])["status"], "awaiting_review")
        _, member, _ = self.request("POST", "/api/members", {"name": "成员甲", "domain_id": "ecommerce", "department": "运营部", "role": "商品运营", "skill_ids": []})
        status, case, _ = self.request("POST", "/api/cases", {"title": "核查商品", "domain_id": "ecommerce", "requester": "合成企业", "department": "运营部", "description": "等待复核产物", "assignee_id": member["id"], "run_id": run["id"]})
        self.assertEqual(status, 201)
        self.assertEqual(self.request("PATCH", "/api/cases/" + case["id"], {"status": "awaiting_input"})[0], 200)
        _, noted, _ = self.request("POST", "/api/cases/" + case["id"] + "/notes", {"text": "等待工厂确认规格"})
        self.assertEqual(noted["notes"][-1]["text"], "等待工厂确认规格")
        self.assertEqual(self.request("DELETE", "/api/cases/" + case["id"])[0], 200)
        self.assertEqual(self.request("DELETE", "/api/members/" + member["id"])[0], 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
