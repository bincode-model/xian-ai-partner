"""Six honest file workflows. These functions do actual analysis, not UI timers.

Inputs never become code, expressions, network addresses to fetch, or shell args.
Model drafts (when requested) are a separate, optional service step.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

DOMAINS = ("drug", "industry", "ecommerce", "finance", "tourism", "employment", "government", "agriculture")
MAX_ROWS = 10000
MAX_CELL = 10000

SCHEMAS = {
    "drug": ["candidate_id", "target", "indication", "evidence_source", "affinity_nm", "assay_status", "safety_flag"],
    "industry": ["defect_id", "line", "batch", "defect_type", "severity", "quantity", "status"],
    "ecommerce": ["sku", "name", "origin", "category", "price", "stock", "description"],
    "finance": ["invoice_id", "customer", "invoice_date", "due_date", "amount", "paid_amount"],
    "tourism": ["spot_id", "name", "district", "open_time", "close_time", "duration_minutes", "ticket_price", "description"],
    "employment": ["employee_id", "name", "department", "role", "skill", "level", "target_level"],
    "government": ["case_id", "matter", "district", "required_docs", "provided_docs", "owner_department", "status"],
    "agriculture": ["batch_id", "product", "origin", "harvest_date", "quantity_kg", "allocated_kg", "delivery_date", "storage_note"],
}

SAMPLE_ROWS = {
    "government": [
        ["SYN-G001", "示例·便民事项资料核对", "示例街道", "申请表;经营说明", "申请表", "示例综合窗口", "open"],
        ["SYN-G002", "示例·事项流转", "示例街道", "申请表", "申请表", "示例综合窗口", "in_progress"],
        ["SYN-G003", "示例·结项资料归档", "示例社区", "办结回执", "办结回执", "示例社区服务", "resolved"],
    ],
    "agriculture": [
        ["SYN-A001", "合成示例·苹果", "陕西洛川（示例）", "2026-09-20", "1200", "700", "2026-10-01", "储存要求待合作社核对"],
        ["SYN-A002", "合成示例·猕猴桃", "陕西周至（示例）", "2026-09-23", "800", "300", "2026-09-29", "冷链要求待仓储负责人核对"],
        ["SYN-A003", "合成示例·茶叶", "陕西汉中（示例）", "2026-09-01", "100", "100", "2026-10-05", "干燥避光要求待厂家核对"],
    ],
    "drug": [
        ["SYN-C001", "HER2", "肿瘤研究（合成示例）", "合成实验记录 E001（非真实文献）", "12.4", "validated_in_vitro", "unknown"],
        ["SYN-C002", "HER2", "肿瘤研究（合成示例）", "合成实验记录 E002（非真实文献）", "35.7", "pending", "flagged"],
        ["SYN-C003", "CFTR", "罕见病研究（合成示例）", "合成实验记录 E003（非真实文献）", "8.1", "validated_in_vitro", "clear_in_assay"],
    ],
    "industry": [
        ["SYN-D001", "示例产线 A", "SYN-B01", "表面划伤", "medium", "12", "open"],
        ["SYN-D002", "示例产线 A", "SYN-B01", "尺寸超差", "critical", "3", "open"],
        ["SYN-D003", "示例产线 B", "SYN-B02", "表面划伤", "low", "5", "resolved"],
    ],
    "ecommerce": [
        ["SYN-SKU01", "合成示例·陕西苹果礼盒", "陕西洛川（示例）", "水果", "69.90", "120", "合成示例：5 千克装，产品规格待商家确认。"],
        ["SYN-SKU02", "合成示例·茶叶礼盒", "陕西汉中（示例）", "茶叶", "128.00", "35", "合成示例：100 克装，产地与生产许可待商家确认。"],
        ["SYN-SKU03", "合成示例·文创书签", "陕西西安（示例）", "文创", "29.90", "0", "合成示例：金属书签，图片及知识产权待商家确认。"],
    ],
    "finance": [
        ["SYN-I001", "合成客户甲", "2026-06-01", "2026-07-01", "12000.00", "3000.00"],
        ["SYN-I002", "合成客户乙", "2026-09-01", "2026-10-01", "8000.00", "8000.00"],
        ["SYN-I003", "合成客户甲", "2026-08-01", "2026-09-01", "5500.00", "0.00"],
    ],
    "tourism": [
        ["SYN-T001", "合成示例·城墙展厅", "示例城区", "09:00", "17:00", "90", "30.00", "合成地点，非真实营业信息。"],
        ["SYN-T002", "合成示例·非遗工坊", "示例城区", "10:00", "18:00", "60", "20.00", "合成地点，非真实预订产品。"],
        ["SYN-T003", "合成示例·园区展馆", "示例园区", "09:00", "16:00", "75", "0.00", "合成地点，需另外核实交通。"],
    ],
    "employment": [
        ["SYN-E001", "合成员工甲", "示例运营部", "商品运营", "商品字段整理", "2", "4"],
        ["SYN-E001", "合成员工甲", "示例运营部", "商品运营", "内容人工复核", "3", "4"],
        ["SYN-E002", "合成员工乙", "示例服务部", "客户服务", "工单分类", "4", "4"],
    ],
}

STEP_NAMES = {
    "government": ["读取事项台账", "核验编号与字段", "整理材料清单", "计算补件与部门负载", "编排流转草稿", "保存便民服务产物", "汇总待审结论"],
    "agriculture": ["读取产地批次", "校验数量与日期", "核对可分配余量", "计算交付与缺口", "编排批次核对清单", "保存乡村产业产物", "汇总待审结论"],
    "drug": ["读取证据表", "校验研究字段", "统一实验记录", "整理候选与缺口", "生成验证任务", "保存研究产物", "汇总待审结论"],
    "industry": ["读取缺陷记录", "校验批次与数量", "统一缺陷等级", "计算缺陷分布", "编排处置工单", "保存质量产物", "汇总待审结论"],
    "ecommerce": ["读取商品资料", "校验 SKU 与库存", "整理商品字段", "检查上架缺口", "编制四平台草稿", "保存商品产物", "汇总待审结论"],
    "finance": ["读取应收台账", "校验金额与日期", "核对应收余额", "计算账龄与集中度", "编制核对清单", "保存财务产物", "汇总待审结论"],
    "tourism": ["读取文旅资源", "校验开放时间", "整理区域与票价", "检验行程可行性", "编排路线草稿", "保存文旅产物", "汇总待审结论"],
    "employment": ["读取岗位技能表", "校验人员与等级", "整理岗位档案", "计算技能缺口", "编排学习任务", "保存成长产物", "汇总待审结论"],
}


class InputError(ValueError):
    pass


def business_today():
    return datetime.now(ZoneInfo("Asia/Shanghai")).date()


def csv_text(columns, rows):
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(columns)
    for row in rows:
        # Quarantine spreadsheet formula injection in downloadable CSV files.
        writer.writerow(["'" + str(v) if isinstance(v, str) and v.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else v for v in row])
    return out.getvalue()


def sample(domain):
    return {
        "filename": f"synthetic-{domain}.csv",
        "text": csv_text(SCHEMAS[domain], SAMPLE_ROWS[domain]),
        "description": "全部为合成示例，不能作为真实业务、医学证据、营业信息或业绩数据。请用经授权的真实文件替换。",
    }


def parse(text):
    text = text.lstrip("\ufeff").strip()
    if not text:
        raise InputError("输入文件为空")
    if text[0] in "[{":
        try:
            obj = json.loads(text, parse_constant=lambda value: (_ for _ in ()).throw(InputError(f"不支持的数值 {value}")))
        except (json.JSONDecodeError, RecursionError) as exc:
            raise InputError(f"JSON 格式错误：{str(exc)[:180]}") from exc
        rows = obj.get("rows") if isinstance(obj, dict) else obj
        if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
            raise InputError("JSON 必须是对象数组，或包含 rows 对象数组")
        headers = set().union(*(r.keys() for r in rows)) if rows else set()
    else:
        try:
            reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
            fields = reader.fieldnames or []
            if not fields or len(fields) != len(set(fields)):
                raise InputError("CSV 表头为空或存在重复列")
            headers = set(fields)
            rows = []
            for row in reader:
                if None in row or any(v is None for v in row.values()):
                    raise InputError(f"第 {reader.line_num} 行列数与表头不一致")
                rows.append(row)
                if len(rows) > MAX_ROWS:
                    raise InputError(f"一次最多处理 {MAX_ROWS} 行")
        except csv.Error as exc:
            raise InputError(f"CSV 格式错误：{exc}") from exc
    if not rows or len(rows) > MAX_ROWS:
        raise InputError(f"需要 1—{MAX_ROWS} 条记录")
    cleaned = []
    for idx, row in enumerate(rows, 2):
        clean = {}
        for key, val in row.items():
            if not isinstance(key, str) or not key or len(key) > 128:
                raise InputError(f"第 {idx} 行包含无效字段名")
            if isinstance(val, (dict, list)):
                raise InputError(f"第 {idx} 行字段 {key} 必须是单个值")
            if isinstance(val, float) and not math.isfinite(val):
                raise InputError(f"第 {idx} 行字段 {key} 数值无效")
            val = "" if val is None else str(val).strip()
            if len(val) > MAX_CELL or "\x00" in val:
                raise InputError(f"第 {idx} 行字段 {key} 内容过长或含空字符")
            clean[key] = val
        cleaned.append(clean)
    return {"rows": cleaned, "headers": headers, "total": len(rows)}


def number(value, name, *, integer=False, maximum=1_000_000_000):
    try:
        result = Decimal(value)
    except InvalidOperation as exc:
        raise InputError(f"{name} 不是有效数字") from exc
    if not result.is_finite() or result < 0 or result > maximum:
        raise InputError(f"{name} 需为 0—{maximum} 的有限数字")
    if integer and result != result.to_integral_value():
        raise InputError(f"{name} 必须是整数")
    return int(result) if integer else result


def money(value, name):
    result = number(value, name)
    if result != result.quantize(Decimal("0.01")):
        raise InputError(f"{name} 最多保留两位小数")
    return result


def clock(value, name):
    if not re.fullmatch(r"\d{2}:\d{2}", value):
        raise InputError(f"{name} 需要 HH:MM 格式")
    h, m = map(int, value.split(":"))
    if h > 23 or m > 59:
        raise InputError(f"{name} 时间无效")
    return h * 60 + m


def validate(domain, parsed, as_of=None):
    missing = set(SCHEMAS[domain]) - parsed["headers"]
    if missing:
        raise InputError("缺少必需字段：" + ", ".join(sorted(missing)))
    issues, valid, seen = [], [], set()
    as_of = as_of or business_today()
    # Quarantine every conflicting ID, so swapping file row order cannot change
    # accounting totals or silently decide which of two product facts is true.
    grouped, blocked = defaultdict(list), {}
    for idx, original in enumerate(parsed["rows"], 2):
        identity = original.get(SCHEMAS[domain][0], "")
        key = (identity, original.get("skill", "")) if domain == "employment" else identity
        if identity:
            grouped[key].append((idx, original))
    for entries in grouped.values():
        if len(entries) > 1:
            identical = all(row == entries[0][1] for _, row in entries[1:])
            for idx, _ in (entries[1:] if identical else entries):
                blocked[idx] = "完全相同的重复记录，仅保留一条" if identical else "重复 ID 存在字段冲突，同 ID 全部记录已隔离，需人工核对"
    employee_names = {}
    for idx, original in enumerate(parsed["rows"], 2):
        if idx in blocked:
            issues.append(f"第 {idx} 行：{blocked[idx]}")
            continue
        row = {key: original.get(key, "") for key in SCHEMAS[domain]}
        try:
            empty = [key for key, value in row.items() if not value and not (domain == "drug" and key == "affinity_nm" and row.get("assay_status") in {"pending", "failed"}) and not (domain == "government" and key == "provided_docs")]
            if empty:
                raise InputError("必填字段为空：" + ", ".join(empty))
            identity = row[SCHEMAS[domain][0]]
            if len(identity) > 100:
                raise InputError("记录 ID 超过 100 字符")
            key = (identity, row["skill"]) if domain == "employment" else identity
            if key in seen:
                raise InputError("重复 ID／重复人员技能记录")
            if domain == "drug":
                row["affinity_nm"] = number(row["affinity_nm"], "affinity_nm") if row["affinity_nm"] else None
                if row["affinity_nm"] is not None and row["affinity_nm"] <= 0:
                    raise InputError("affinity_nm 需大于零")
                if row["assay_status"] not in {"pending", "validated_in_vitro", "failed"}:
                    raise InputError("assay_status 仅支持 pending / validated_in_vitro / failed")
                if row["safety_flag"] not in {"unknown", "flagged", "clear_in_assay"}:
                    raise InputError("safety_flag 仅支持 unknown / flagged / clear_in_assay")
            elif domain == "industry":
                row["quantity"] = number(row["quantity"], "quantity", integer=True)
                if row["quantity"] < 1:
                    raise InputError("quantity 需大于零")
                if row["severity"] not in {"low", "medium", "high", "critical"}:
                    raise InputError("severity 仅支持 low / medium / high / critical")
                if row["status"] not in {"open", "in_progress", "resolved"}:
                    raise InputError("status 仅支持 open / in_progress / resolved")
            elif domain == "ecommerce":
                row["price"] = money(row["price"], "price")
                if row["price"] <= 0:
                    raise InputError("price 需大于零")
                row["stock"] = number(row["stock"], "stock", integer=True)
            elif domain == "finance":
                currency = original.get("currency", "").upper()
                if currency and currency != "CNY":
                    raise InputError("currency 非 CNY；禁止混算币种，请先经财务核实换算或单独处理")
                row["currency"] = "CNY"
                row["currency_assumed"] = not bool(currency)
                for field in ["invoice_date", "due_date"]:
                    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row[field]):
                        raise InputError(f"{field} 需要 YYYY-MM-DD 格式")
                    try:
                        row[field] = date.fromisoformat(row[field])
                    except ValueError as exc:
                        raise InputError(f"{field} 日期无效") from exc
                if row["due_date"] < row["invoice_date"]:
                    raise InputError("到期日早于开票日")
                if row["invoice_date"] > as_of:
                    raise InputError(f"开票日 {row['invoice_date']} 晚于业务日期 {as_of}，不能计入当前应收")
                row["amount"] = money(row["amount"], "amount")
                row["paid_amount"] = money(row["paid_amount"], "paid_amount")
                if row["paid_amount"] > row["amount"]:
                    raise InputError("实收超过应收；需单独核对预收或冲销，不自动合并")
            elif domain == "tourism":
                row["open_min"] = clock(row["open_time"], "open_time")
                row["close_min"] = clock(row["close_time"], "close_time")
                row["duration_minutes"] = number(row["duration_minutes"], "duration_minutes", integer=True, maximum=720)
                if not row["duration_minutes"]:
                    raise InputError("游览时长需大于零")
                if row["open_min"] >= row["close_min"]:
                    raise InputError("仅支持当日营业；关闭时间须晚于开放时间")
                row["ticket_price"] = money(row["ticket_price"], "ticket_price")
            elif domain == "government":
                if row["status"] not in {"open", "in_progress", "resolved"}:
                    raise InputError("status 仅支持 open / in_progress / resolved")
                row["required_docs"] = sorted(set(filter(None, (x.strip() for x in re.split(r"[;；|]", row["required_docs"])))))
                row["provided_docs"] = sorted(set(filter(None, (x.strip() for x in re.split(r"[;；|]", row["provided_docs"])))))
                if not row["required_docs"]:
                    raise InputError("required_docs 至少需要一项材料")
            elif domain == "agriculture":
                row["quantity_kg"] = number(row["quantity_kg"], "quantity_kg")
                row["allocated_kg"] = number(row["allocated_kg"], "allocated_kg")
                if row["quantity_kg"] <= 0 or row["allocated_kg"] > row["quantity_kg"]:
                    raise InputError("批次数量须大于零，已分配数量不能超过批次数量")
                try:
                    row["harvest_date"] = date.fromisoformat(row["harvest_date"])
                    row["delivery_date"] = date.fromisoformat(row["delivery_date"])
                except ValueError as exc:
                    raise InputError("日期需要有效的 YYYY-MM-DD 格式") from exc
                if row["delivery_date"] < row["harvest_date"]:
                    raise InputError("delivery_date 不能早于 harvest_date")
            elif domain == "employment":
                row["level"] = number(row["level"], "level", integer=True, maximum=5)
                row["target_level"] = number(row["target_level"], "target_level", integer=True, maximum=5)
                person = (row["name"], row["department"], row["role"])
                if identity in employee_names and employee_names[identity] != person:
                    raise InputError("同一员工 ID 对应了不同姓名、部门或岗位")
                employee_names[identity] = person
            seen.add(key)
            row["source_row"] = idx
            valid.append(row)
        except InputError as exc:
            issues.append(f"第 {idx} 行：{exc}")
    if not valid:
        raise InputError("所有记录均未通过校验。" + "；".join(issues[:12]))
    return {"rows": valid, "issues": issues, "total": parsed["total"], "excluded": len(issues)}


def normalize(domain, validated):
    # Keep source row and values for evidence tracing; do not silently deduplicate.
    rows = [dict(row) for row in validated["rows"]]
    if domain == "government":
        for row in rows:
            row["missing_docs"] = sorted(set(row["required_docs"]) - set(row["provided_docs"]))
    if domain == "agriculture":
        for row in rows:
            row["available_kg"] = row["quantity_kg"] - row["allocated_kg"]
    if domain == "finance":
        for row in rows:
            row["outstanding"] = row["amount"] - row["paid_amount"]
    if domain == "employment":
        for row in rows:
            row["gap"] = max(0, row["target_level"] - row["level"])
    return {**validated, "rows": rows}


def analyze(domain, state, as_of=None):
    rows = state["rows"]
    as_of = as_of or business_today()
    result = {"valid_records": len(rows), "excluded_records": state["excluded"], "as_of": as_of.isoformat()}
    if domain == "drug":
        result.update({"targets": len({r["target"] for r in rows}), "in_vitro_records": sum(r["assay_status"] == "validated_in_vitro" for r in rows), "safety_flags": sum(r["safety_flag"] == "flagged" for r in rows), "unmeasured_affinity_records": sum(r["affinity_nm"] is None for r in rows)})
        for row in rows:
            row["research_action"] = ("暂停推进并请专业人员复核安全信号" if row["safety_flag"] == "flagged" else "复核失败实验与方法，不建议据此推进" if row["assay_status"] == "failed" else "补充体外验证与安全性研究计划" if row["assay_status"] == "pending" else "核对原始实验，补充复现实验和安全性证据")
        result["limitations"] = "不同靶点、实验方法的亲和力不可直接横向排名；体外记录不代表临床疗效或可上市药物。未访问或验证 evidence_source。"
    elif domain == "industry":
        distribution = Counter()
        for row in rows:
            distribution[row["defect_type"]] += row["quantity"]
        result.update({"defect_units": sum(distribution.values()), "unresolved_units": sum(r["quantity"] for r in rows if r["status"] != "resolved"), "critical_open_records": sum(r["severity"] == "critical" and r["status"] != "resolved" for r in rows), "distribution": dict(distribution.most_common())})
        result["limitations"] = "缺少总产量和采样口径，不能计算不良率、良率或提效百分比。工单仅为人工确认草稿，未连接生产设备。"
    elif domain == "ecommerce":
        claim_words = ("治愈", "抗癌", "治疗", "药效", "百分百", "100%", "全网最低", "国家级", "第一", "顶级", "最强")
        for row in rows:
            row["claim_flags"] = [word for word in claim_words if word in row["name"] + row["description"]]
        result.update({"products": len(rows), "out_of_stock": sum(r["stock"] == 0 for r in rows), "claim_flag_products": sum(bool(r["claim_flags"]) for r in rows), "drafts": 4 * len(rows)})
        result["limitations"] = "只生成淘宝、天猫、抖音、拼多多内容草稿；未登录、抓取或发布到平台。平台类目、图片、资质、运费和实时规则仍需人工核验。"
    elif domain == "finance":
        buckets = {key: Decimal(0) for key in ["not_due", "1_30", "31_60", "61_90", "over_90"]}
        customers = defaultdict(lambda: Decimal(0))
        for row in rows:
            row["days_overdue"] = max(0, (as_of - row["due_date"]).days) if row["outstanding"] else 0
            days = row["days_overdue"]
            row["bucket"] = "not_due" if days == 0 else "1_30" if days <= 30 else "31_60" if days <= 60 else "61_90" if days <= 90 else "over_90"
            buckets[row["bucket"]] += row["outstanding"]
            customers[row["customer"]] += row["outstanding"]
        total = sum(customers.values(), Decimal(0))
        result.update({"total_invoiced": sum((r["amount"] for r in rows), Decimal(0)), "total_received": sum((r["paid_amount"] for r in rows), Decimal(0)), "outstanding": total, "overdue": sum((r["outstanding"] for r in rows if r["days_overdue"] > 0), Decimal(0)), "aging": buckets, "assumed_currency_records": sum(r["currency_assumed"] for r in rows), "customer_outstanding": dict(sorted(customers.items(), key=lambda x: x[1], reverse=True)), "largest_customer_share_percent": round(float(max(customers.values(), default=Decimal(0)) / total * 100), 2) if total else 0})
        result["limitations"] = "按上传台账与运行日期计算，未验证合同、发票或银行流水；没有贷款审批、征信查询或催收发送。币种默认人民币，跨币种记录必须先由财务统一口径。"
    elif domain == "tourism":
        groups = defaultdict(list)
        for row in rows:
            groups[row["district"]].append(row)
        routes, skipped = [], []
        for district, spots in sorted(groups.items()):
            cursor, route = 9 * 60, []
            for row in sorted(spots, key=lambda r: (r["close_min"], r["open_min"])):
                start = max(cursor, row["open_min"])
                end = start + row["duration_minutes"]
                if end > row["close_min"]:
                    skipped.append({"spot_id": row["spot_id"], "reason": "当日开放时段无法容纳计划游览；需单独调整", "source_row": row["source_row"]})
                    continue
                route.append({**row, "start_min": start, "end_min": end})
                cursor = end + 15
            routes.append({"district": district, "stops": route, "ticket_total": sum((r["ticket_price"] for r in route), Decimal(0))})
        result.update({"routes": routes, "skipped": skipped, "scheduled_spots": sum(len(r["stops"]) for r in routes)})
        result["limitations"] = "每个区域为独立一天；站间暂用 15 分钟估算，未查询真实交通、距离、节假日、容量或可订票情况。必须人工核实后出行，未执行预订。"
    elif domain == "government":
        result.update({"missing_document_cases": sum(bool(r["missing_docs"]) for r in rows), "open_cases": sum(r["status"] != "resolved" for r in rows), "department_load": dict(Counter(r["owner_department"] for r in rows if r["status"] != "resolved"))})
        result["limitations"] = "材料要求来自上传台账，未验证当前办事指南。补件清单和部门归属须窗口人员核实；没有作出行政审批、资格或补贴决定，也没有连接政府系统。"
    elif domain == "agriculture":
        result.update({"quantity_kg": sum((r["quantity_kg"] for r in rows), Decimal(0)), "allocated_kg": sum((r["allocated_kg"] for r in rows), Decimal(0)), "available_kg": sum((r["available_kg"] for r in rows), Decimal(0)), "past_delivery_date_batches": sum(r["delivery_date"] < as_of for r in rows)})
        result["limitations"] = "按上传批次计算可分配余量；未核实实物、质检、冷链或物流状态。超过计划交付日期仅为提醒，不代表已经延误；未发货、未交易，未提供农药使用建议。"
    else:
        people = defaultdict(lambda: {"gaps": 0, "skills": 0, "total_gap": 0})
        for row in rows:
            person = people[row["employee_id"]]
            person.update({key: row[key] for key in ["name", "department", "role"]})
            person["skills"] += 1
            person["gaps"] += int(row["gap"] > 0)
            person["total_gap"] += row["gap"]
        result.update({"people": dict(people), "gap_records": sum(r["gap"] > 0 for r in rows), "total_gap": sum(r["gap"] for r in rows)})
        result["limitations"] = "等级来自输入资料（0—5），不是自动测评事实。计划需本人和主管共同确认；不能据此自动筛人、录用、淘汰或评价人格。"
    return result


def json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2, default=lambda item: str(item) if isinstance(item, (Decimal, date, datetime)) else item)


def md(value):
    # Data cannot introduce raw HTML or Markdown links into reports.
    value = str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    for ch in "\\`*_{}[]()#!|":
        value = value.replace(ch, "\\" + ch)
    return value.replace("\r", " ").replace("\n", " ")


def build(domain, state, analysis):
    rows = state["rows"]
    files = []
    def add_csv(name, columns, values):
        files.append((name, "text/csv; charset=utf-8", "\ufeff" + csv_text(columns, values)))
    title = {"drug": "药物研发证据整理", "industry": "制造质量协作", "ecommerce": "陕西商品多平台草稿", "finance": "小店应收台账核对", "tourism": "文旅路线草稿", "employment": "岗位技能成长", "government": "便民事项与补件核对", "agriculture": "产地批次与交付核对"}[domain]
    report = [f"# {title} · 待人工复核", "", "> 本文件由上传资料实际计算或整理生成；示例来源仍为合成示例，不代表已落地业绩。", "", f"处理记录：{state['total']} 条；通过：{len(rows)} 条；排除：{state['excluded']} 条。", "", "## 适用范围", "", analysis["limitations"], ""]
    if domain == "drug":
        add_csv("候选证据矩阵.csv", SCHEMAS[domain] + ["research_action", "source_row"], [[r[k] for k in SCHEMAS[domain] + ["research_action", "source_row"]] for r in rows])
        tasks = [{"candidate_id": r["candidate_id"], "target": r["target"], "task": r["research_action"], "owner_role": "药理/实验负责人", "state": "待人工确认", "acceptance": "附原始实验记录、方法、重复次数及专业复核意见", "source_row": r["source_row"]} for r in rows]
        report += ["## 证据与下一步", "", f"涉及 {analysis['targets']} 个靶点；输入标记为体外已验证 {analysis['in_vitro_records']} 条；安全信号 {analysis['safety_flags']} 条；亲和力尚未测量 {analysis['unmeasured_affinity_records']} 条（保留空值，没有补零）。", "", "药物研发专业人员须先检查实验方法和证据来源；本次没有做分子实验或证明临床疗效。", ""]
        for task in tasks:
            report += [f"- {md(task['candidate_id'])}：{md(task['task'])}。"]
    elif domain == "industry":
        rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        tasks = [{"defect_id": r["defect_id"], "line": r["line"], "batch": r["batch"], "priority": r["severity"], "task": f"核实 {r['defect_type']}，隔离范围和处置措施由质量负责人确认", "owner_role": "质量工程师/产线负责人", "state": "待人工确认", "source_row": r["source_row"]} for r in sorted(rows, key=lambda x: rank[x["severity"]]) if r["status"] != "resolved"]
        cumulative, total, pareto = 0, analysis["defect_units"], []
        for kind, quantity in analysis["distribution"].items():
            cumulative += quantity
            pareto.append([kind, quantity, round(quantity / total * 100, 2), round(cumulative / total * 100, 2)])
        add_csv("缺陷分布.csv", ["defect_type", "quantity", "share_percent", "cumulative_percent"], pareto)
        add_csv("处置工单草稿.csv", ["defect_id", "line", "batch", "priority", "task", "state"], [[r[k] for k in ["defect_id", "line", "batch", "priority", "task", "state"]] for r in tasks])
        report += ["## 核对结果", "", f"输入共记录缺陷件次 {total}，未结项件次 {analysis['unresolved_units']}，未结项 critical 记录 {analysis['critical_open_records']} 条。同一件产品可能重复计次，不能视为去重后的不良品总数。", "", f"生成 {len(tasks)} 条待分派工单。"]
    elif domain == "ecommerce":
        tasks, drafts = [], []
        for row in rows:
            flags = (["库存为零，暂停发布"] if row["stock"] == 0 else []) + (["文案需核查：" + "/".join(row["claim_flags"])] if row["claim_flags"] else [])
            common = "资质、品牌权属、图片、类目、运费及平台当前规则待确认"
            for platform in ["淘宝", "天猫", "抖音", "拼多多"]:
                title_text = f"{row['name']}｜{row['origin']}"[:60]
                copy = f"{row['name']}，产地信息：{row['origin']}。{row['description']} 价格与库存以上架复核为准。"
                drafts.append([row["sku"], platform, title_text, copy, row["price"], row["stock"], "待人工确认，未发布", "；".join(flags + [common]), row["source_row"]])
            tasks.append({"sku": row["sku"], "task": "核对商品事实、图片和资质后人工审批平台草稿", "checks": flags + [common], "owner_role": "商品运营/审核负责人", "state": "待人工确认", "source_row": row["source_row"]})
        add_csv("四平台商品草稿.csv", ["sku", "platform", "title", "copy", "price_cny", "stock", "status", "review_checks", "source_row"], drafts)
        add_csv("商品字段核对.csv", SCHEMAS[domain] + ["claim_flags", "source_row"], [[("/".join(r[k]) if k == "claim_flags" else r[k]) for k in SCHEMAS[domain] + ["claim_flags", "source_row"]] for r in rows])
        report += ["## 草稿结果", "", f"{len(rows)} 个 SKU，共 {len(drafts)} 条四平台草稿。零库存商品 {analysis['out_of_stock']} 个，存在需核查措辞的商品 {analysis['claim_flag_products']} 个。", "", "原始描述中的风险措辞已保留并标记，不能未经复核直接发布。", ""]
    elif domain == "finance":
        add_csv("应收账龄明细.csv", SCHEMAS[domain] + ["currency", "currency_assumed", "outstanding", "days_overdue", "bucket", "source_row"], [[r[k] for k in SCHEMAS[domain] + ["currency", "currency_assumed", "outstanding", "days_overdue", "bucket", "source_row"]] for r in rows])
        add_csv("客户余额汇总.csv", ["customer", "outstanding_cny"], list(analysis["customer_outstanding"].items()))
        tasks = [{"invoice_id": r["invoice_id"], "customer": r["customer"], "outstanding": str(r["outstanding"]), "task": "核对合同、发票与收款流水，确认余额和付款计划", "owner_role": "财务应收专员", "state": "待人工确认", "source_row": r["source_row"]} for r in rows if r["outstanding"] > 0]
        report += ["## 台账计算结果（人民币元）", "", f"业务日期（Asia/Shanghai）：{analysis['as_of']}。应收原额 {analysis['total_invoiced']:.2f}；已收 {analysis['total_received']:.2f}；未收 {analysis['outstanding']:.2f}；已逾期未收 {analysis['overdue']:.2f}。", "", f"币种假设：{analysis['assumed_currency_records']} 条记录未提供 currency，按人民币 CNY 暂计，须由财务确认；显式非 CNY 记录已排除。", "", f"最大客户占未收余额 {analysis['largest_customer_share_percent']}%。这个比例只是台账集中度，不能当成信用评级。", "", "## 账龄", ""] + [f"- {key}：{value:.2f} 元" for key, value in analysis["aging"].items()]
    elif domain == "tourism":
        tasks, route_rows = [], []
        fmt = lambda minutes: f"{minutes // 60:02d}:{minutes % 60:02d}"
        for route in analysis["routes"]:
            report += [f"## {md(route['district'])} · 独立一天", "", f"输入票价合计 {route['ticket_total']:.2f} 元/人，不含交通餐饮。", ""]
            for index, row in enumerate(route["stops"], 1):
                report += [f"- {fmt(row['start_min'])}—{fmt(row['end_min'])}：{md(row['name'])}"]
                route_rows.append([route["district"], index, row["spot_id"], row["name"], fmt(row["start_min"]), fmt(row["end_min"]), row["ticket_price"], "站间 15 分钟仅为估算，待核实", row["source_row"]])
                tasks.append({"spot_id": row["spot_id"], "task": "核实开放日、交通、票价、容量、无障碍与预订条件", "owner_role": "文旅运营", "state": "待人工确认", "source_row": row["source_row"]})
        add_csv("分区路线草稿.csv", ["district", "sequence", "spot_id", "name", "start", "end", "ticket_cny", "transfer_note", "source_row"], route_rows)
        if analysis["skipped"]:
            report += ["", "## 未排入的地点", ""] + [f"- {md(r['spot_id'])}：{r['reason']}" for r in analysis["skipped"]]
    elif domain == "government":
        columns = SCHEMAS[domain] + ["missing_docs", "source_row"]
        add_csv("事项补件清单.csv", columns, [[";".join(r[k]) if isinstance(r[k], list) else r[k] for k in columns] for r in rows])
        add_csv("部门待办汇总.csv", ["owner_department", "open_cases"], list(analysis["department_load"].items()))
        tasks = [{"case_id": r["case_id"], "task": "核对办事指南及补件项：" + ("；".join(r["missing_docs"]) or "材料名称齐备，仍需核对内容"), "owner_role": r["owner_department"], "state": "待窗口人工确认", "source_row": r["source_row"]} for r in rows if r["status"] != "resolved"]
        report += ["## 材料与流转核对", "", f"未结项 {analysis['open_cases']} 件；{analysis['missing_document_cases']} 件存在台账材料名称缺口。材料名称齐备不等于审批通过。", ""]
    elif domain == "agriculture":
        columns = SCHEMAS[domain] + ["available_kg", "source_row"]
        add_csv("产地批次余量.csv", columns, [[r[k] for k in columns] for r in rows])
        tasks = [{"batch_id": r["batch_id"], "task": "核对实物、质检和计划交付，确认可分配余量", "available_kg": str(r["available_kg"]), "delivery_date": str(r["delivery_date"]), "owner_role": "合作社/仓储与交付负责人", "state": "待人工确认，未发货", "source_row": r["source_row"]} for r in rows]
        report += ["## 批次与余量", "", f"输入批次数量 {analysis['quantity_kg']} kg；已分配 {analysis['allocated_kg']} kg；可分配 {analysis['available_kg']} kg。业务日期：{analysis['as_of']}；{analysis['past_delivery_date_batches']} 个批次超过计划交付日期，需核实实际进度。", ""]
    else:
        tasks = [{"employee_id": r["employee_id"], "name": r["name"], "department": r["department"], "role": r["role"], "skill": r["skill"], "current_level": r["level"], "target_level": r["target_level"], "gap": r["gap"], "task": f"完成一份“{r['skill']}”真实业务练习，保存输入、产物与复核记录", "acceptance": "员工与主管按同一量表复评；未验收前不提升技能等级", "owner_role": "本人/带教主管", "state": "待共同确认", "source_row": r["source_row"]} for r in sorted(rows, key=lambda r: r["gap"], reverse=True) if r["gap"] > 0]
        add_csv("岗位技能缺口.csv", SCHEMAS[domain] + ["gap", "source_row"], [[r[k] for k in SCHEMAS[domain] + ["gap", "source_row"]] for r in rows])
        report += ["## 技能与练习", "", f"共 {len(analysis['people'])} 人、{len(rows)} 项人员技能记录，{analysis['gap_records']} 项存在输入量表上的差距，生成 {len(tasks)} 项练习。", "", "没有统计就业率、录用率或提升成效；这些需要后续真实验收记录。", ""]
        for task in tasks:
            report += [f"- {md(task['name'])} / {md(task['skill'])}：{task['current_level']} → {task['target_level']}；{md(task['task'])}。"]
    report += ["", "## 数据质量", ""] + (["- " + md(issue) for issue in state["issues"]] or ["必填字段及当前规则校验通过；这不代表原始事实已获外部验证。"])
    report += ["", "## 复核要求", "", "请责任人核实原始资料、适用范围与产物内容后审批。审批只代表本次本地文件产物通过复核，不会向外部平台发布或触发业务交易。", ""]
    files.extend([
        ("待办与验收.json", "application/json; charset=utf-8", json_text({"review_required": True, "tasks": tasks})),
        ("分析与数据质量.json", "application/json; charset=utf-8", json_text({"domain": domain, "total_input_rows": state["total"], "issues": state["issues"], "analysis": analysis})),
        ("业务报告-待复核.md", "text/markdown; charset=utf-8", "\n".join(report)),
    ])
    return files


def summary(domain, state, analysis, artifact_count):
    texts = {
        "government": f"核对 {len(state['rows'])} 个事项，{analysis.get('missing_document_cases', 0)} 个事项有材料名称缺口；审批仍由窗口人员完成。",
        "agriculture": f"核对 {len(state['rows'])} 个产地批次，可分配余量 {analysis.get('available_kg', 0)} kg；尚未核实实物或发货。",
        "drug": f"整理 {len(state['rows'])} 条候选证据，标记 {analysis.get('safety_flags', 0)} 条安全信号；未进行实验或临床验证。",
        "industry": f"核算 {analysis.get('defect_units', 0)} 缺陷件次，{analysis.get('critical_open_records', 0)} 条 critical 记录待核实。",
        "ecommerce": f"从 {len(state['rows'])} 个 SKU 生成 {analysis.get('drafts', 0)} 条四平台草稿，尚未发布。",
        "finance": f"核算未收余额 {analysis.get('outstanding', 0):.2f} 元；结果来自输入台账，尚未核对原始凭证。",
        "tourism": f"按输入开放时间排入 {analysis.get('scheduled_spots', 0)} 处地点；交通和可预约情况仍需核实。",
        "employment": f"识别 {analysis.get('gap_records', 0)} 项技能差距并形成练习计划，尚未完成技能验收。",
    }
    return texts[domain] + f" 已保存 {artifact_count} 份产物，排除 {state['excluded']} 条不合格记录，等待人工复核。"
