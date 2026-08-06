#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量为 English Study 词汇 JSON 的 example_meaning 字段补齐中文翻译。
使用 Google Translate 免费 endpoint（非官方，可能有 rate limit）。
支持断点续跑：会在 project root 留下 .enrich_example_meanings_checkpoint.json。
"""
import json
import os
import re
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
CHECKPOINT_FILE = ROOT / ".enrich_example_meanings_checkpoint.json"

LEVELS = ["A1", "A2", "B1", "B2", "C1"]
SLEEP_SECONDS = 0.35  # 控制 rate，避免触发限制


def translate_google(text: str, sl: str = "en", tl: str = "zh-CN") -> str:
    """调用 Google Translate 免费接口翻译单句。"""
    if not text or not text.strip():
        return ""
    q = text.strip()
    url = (
        "https://translate.googleapis.com/translate_a/single"
        f"?client=gtx&sl={sl}&tl={tl}&dt=t&q={urllib.parse.quote(q)}"
    )
    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        },
    )
    with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    # data[0] 是翻译片段列表
    parts = [seg[0] for seg in data[0] if seg[0]]
    return "".join(parts).strip()


def load_checkpoint():
    if CHECKPOINT_FILE.exists():
        try:
            return json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"done_ids": [], "errors": []}


def save_checkpoint(cp):
    CHECKPOINT_FILE.write_text(json.dumps(cp, ensure_ascii=False, indent=2), encoding="utf-8")


def collect_tasks():
    """收集所有需要翻译的 (level, id, example) 。"""
    tasks = []
    for level in LEVELS:
        path = CONTENT_DIR / f"{level}_words.json"
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for entry in data:
            ex = entry.get("example", "")
            em = entry.get("example_meaning", "")
            if ex and ex.strip() and (not em or not em.strip()):
                tasks.append({
                    "level": level,
                    "id": entry["id"],
                    "example": ex.strip(),
                })
    return tasks


def main():
    cp = load_checkpoint()
    done_ids = set(cp.get("done_ids", []))
    errors = cp.get("errors", [])

    tasks = collect_tasks()
    pending = [t for t in tasks if t["id"] not in done_ids]
    print(f"总任务数: {len(tasks)}, 已完成: {len(done_ids)}, 待处理: {len(pending)}")

    if not pending:
        print("没有待处理任务。")
        return

    # 按 level 分组，边翻译边写回
    results_by_level = {}
    total = len(pending)
    for i, task in enumerate(pending, start=1):
        level = task["level"]
        ex = task["example"]
        try:
            zh = translate_google(ex)
            # 简单后处理：去掉多余空白
            zh = re.sub(r"\s+", " ", zh).strip()
            task["example_meaning"] = zh
            done_ids.add(task["id"])
            results_by_level.setdefault(level, []).append(task)
            print(f"[{i}/{total}] {level} {task['id']}: {zh[:40]}...")
        except Exception as e:
            err_info = {"id": task["id"], "level": level, "example": ex, "error": str(e)}
            errors.append(err_info)
            print(f"[{i}/{total}] ERROR {level} {task['id']}: {e}")

        # 每 50 条保存一次 checkpoint 并写回对应 level 文件
        if i % 50 == 0 or i == total:
            flush_to_files(results_by_level)
            results_by_level.clear()
            cp = {"done_ids": sorted(done_ids), "errors": errors}
            save_checkpoint(cp)

        if i < total:
            time.sleep(SLEEP_SECONDS)

    print("全部处理完成。")
    if errors:
        print(f"其中失败 {len(errors)} 条，详见 {CHECKPOINT_FILE}")


def flush_to_files(results_by_level):
    for level, items in results_by_level.items():
        path = CONTENT_DIR / f"{level}_words.json"
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        id_map = {item["id"]: item["example_meaning"] for item in items}
        updated = 0
        for entry in data:
            if entry["id"] in id_map and (not entry.get("example_meaning", "").strip()):
                entry["example_meaning"] = id_map[entry["id"]]
                updated += 1
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  -> 已写回 {path.name}，本次更新 {updated} 条")


if __name__ == "__main__":
    main()
