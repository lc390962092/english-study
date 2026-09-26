#!/usr/bin/env python3
"""Mark today's (or a given day's) English daily words as completed and send a confirmation card."""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS_DIR = os.path.join(BASE_DIR, "private", "daily-words")
TARGET_CHAT_ID = "oc_88d8933f0bd6049c61c7bf9f894e097c"


def today_str(tz: timezone) -> str:
    return datetime.now(tz).strftime("%Y-%m-%d")


def load_data(date_str: str) -> tuple[list, str]:
    path = os.path.join(WORDS_DIR, f"{date_str}.json")
    if not os.path.exists(path):
        raise FileNotFoundError(f"{date_str} 的单词文件不存在：{path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{date_str} 的单词文件格式异常")
    return data, path


def mark_completed(date_str: str, tz: timezone) -> dict:
    data, path = load_data(date_str)
    completed_at = datetime.now(tz).isoformat()
    already = all(w.get("completed") for w in data)

    for item in data:
        item["completed"] = True
        item.setdefault("completed_at", completed_at)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {
        "date": date_str,
        "count": len(data),
        "already": already,
        "completed_at": completed_at,
    }


def build_confirmation_card(result: dict) -> dict:
    status = "✅ 今日已打卡" if not result["already"] else "ℹ️ 今日之前已打卡，重新确认"
    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "green",
            "title": {"tag": "plain_text", "content": "英语单词打卡确认"},
        },
        "elements": [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**{status}**\n日期：{result['date']}\n单词数：{result['count']} 个\n时间：{result['completed_at'][:19]}",
                },
            },
            {"tag": "hr"},
            {
                "tag": "note",
                "elements": [
                    {
                        "tag": "plain_text",
                        "content": "坚持每日积累，继续加油 💪",
                    }
                ],
            },
        ],
    }


def send_confirmation(result: dict) -> None:
    card = build_confirmation_card(result)
    content_json = json.dumps(card, ensure_ascii=False, separators=(",", ":"))
    cmd = [
        "lark-cli", "im", "+messages-send",
        "--chat-id", TARGET_CHAT_ID,
        "--msg-type", "interactive",
        "--content", content_json,
    ]
    subprocess.run(cmd, check=True, cwd=BASE_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    tz = timezone(timedelta(hours=9), "Asia/Tokyo")
    date_arg = sys.argv[1] if len(sys.argv) > 1 else today_str(tz)

    try:
        result = mark_completed(date_arg, tz)
        send_confirmation(result)
        print(f"✅ {result['date']} 英语单词打卡完成，共 {result['count']} 个")
    except FileNotFoundError:
        print(f"ℹ️ {date_arg} 还没有生成每日单词。请先让AI推送当日内容，或运行：python3 scripts/daily-push.py")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 打卡失败：{e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
