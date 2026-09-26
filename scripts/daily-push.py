#!/usr/bin/env python3
"""Generate and push today's English daily words as Feishu card + voice."""
import json
import os
import random
import subprocess
import sys
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_DIR = os.path.join(BASE_DIR, "content")
PRIVATE_DIR = os.path.join(BASE_DIR, "private")
WORDS_DIR = os.path.join(PRIVATE_DIR, "daily-words")
MEDIA_DIR = os.path.join(PRIVATE_DIR, "daily-media")
TARGET_CHAT_ID = "oc_88d8933f0bd6049c61c7bf9f894e097c"

LEVEL_FILES = {
    "A1": "A1_words.json",
    "A2": "A2_words.json",
    "B1": "B1_words.json",
    "B2": "B2_words.json",
    "C1": "C1_words.json",
}
LEVEL_WEIGHTS = {"A1": 4, "A2": 3, "B1": 2, "B2": 1, "C1": 1}


def today_str(tz: timezone) -> str:
    return datetime.now(tz).strftime("%Y-%m-%d")


def load_word_bank(level: str) -> list:
    path = os.path.join(CONTENT_DIR, LEVEL_FILES[level])
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{path} is not a list")
    return data


def pick_words(count: int = 10) -> list:
    words = []
    used = set()
    level_pool = [lvl for lvl in LEVEL_FILES for _ in range(LEVEL_WEIGHTS[lvl])]
    while len(words) < count:
        level = random.choice(level_pool)
        bank = load_word_bank(level)
        candidate = random.choice(bank)
        key = candidate.get("word", "").lower()
        if key and key not in used:
            used.add(key)
            candidate.setdefault("level", level)
            words.append(candidate)
    return words


def save_words(words: list, date_str: str) -> str:
    os.makedirs(WORDS_DIR, exist_ok=True)
    path = os.path.join(WORDS_DIR, f"{date_str}.json")
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(words, f, ensure_ascii=False, indent=2)
    return path


def generate_audio(words: list, date_str: str) -> str:
    os.makedirs(MEDIA_DIR, exist_ok=True)
    mp3_path = os.path.join(MEDIA_DIR, f"{date_str}.mp3")
    opus_path = os.path.join(MEDIA_DIR, f"{date_str}.opus")

    lines = []
    for i, w in enumerate(words, 1):
        lines.append(f"{i}. {w['word']}")
        example = w.get("example", "").strip()
        if example:
            lines.append(example)
    text = "\n\n".join(lines)

    subprocess.run(
        ["edge-tts", "-t", text, "-v", "en-US-GuyNeural", "--write-media", mp3_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", mp3_path,
            "-c:a", "libopus", "-b:a", "24k", "-vbr", "on",
            "-ar", "24000", "-ac", "1",
            opus_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return opus_path


def build_card(words: list, date_str: str) -> dict:
    elements = [
        {
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"**今日目标：{len(words)} 个单词**  坚持打卡，积少成多 💪",
            },
        },
        {"tag": "hr"},
    ]
    for i, w in enumerate(words, 1):
        level = w.get("level", "")
        pos = w.get("pos", "")
        phonetic = w.get("phonetic", "")
        meaning = w.get("meaning", "")
        example = w.get("example", "")
        example_meaning = w.get("example_meaning", "")
        content = (
            f"**{i}. {w['word']}** {phonetic} *{pos}*  `{level}`\n"
            f"{meaning}"
        )
        if example:
            content += f"\n\n*例：{example}*"
            if example_meaning:
                content += f"\n*译：{example_meaning}*"
        elements.append(
            {
                "tag": "div",
                "text": {"tag": "lark_md", "content": content},
            }
        )
        elements.append({"tag": "hr"})

    elements.append(
        {
            "tag": "note",
            "elements": [
                {
                    "tag": "plain_text",
                    "content": "回复「今日英语打卡」标记今日为已完成",
                }
            ],
        }
    )

    return {
        "config": {"wide_screen_mode": True},
        "header": {
            "template": "blue",
            "title": {
                "tag": "plain_text",
                "content": f"每日英语 · {date_str}",
            },
        },
        "elements": elements,
    }


def send_card(card: dict, date_str: str) -> None:
    content_json = json.dumps(card, ensure_ascii=False, separators=(",", ":"))
    cmd = [
        "lark-cli", "im", "+messages-send",
        "--chat-id", TARGET_CHAT_ID,
        "--msg-type", "interactive",
        "--content", content_json,
    ]
    subprocess.run(cmd, check=True, cwd=BASE_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def send_voice(date_str: str) -> None:
    rel_audio = f"private/daily-media/{date_str}.opus"
    cmd = [
        "lark-cli", "im", "+messages-send",
        "--chat-id", TARGET_CHAT_ID,
        "--audio", rel_audio,
    ]
    subprocess.run(cmd, check=True, cwd=BASE_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    tz = timezone(timedelta(hours=9), "Asia/Tokyo")
    date_str = today_str(tz)
    force = "--force" in sys.argv

    words_path = os.path.join(WORDS_DIR, f"{date_str}.json")
    if os.path.exists(words_path) and not force:
        print(f"ℹ️ 今日（{date_str}）单词已推送过，跳过重复发送。\n如需重新推送，请使用：python3 scripts/daily-push.py --force")
        return

    words = pick_words(10)
    save_words(words, date_str)

    audio_path = generate_audio(words, date_str)
    card = build_card(words, date_str)
    send_card(card, date_str)
    send_voice(date_str)

    print(f"📚 今日 {len(words)} 个英语单词（{date_str}）已推送\n卡片 + 语音已发送，回复「今日英语打卡」标记完成。")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ 推送失败：{e}")
        sys.exit(1)
