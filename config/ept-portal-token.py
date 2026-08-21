"""输出公司模型网关的 portal_token（裸 token，不带前缀）。
token 从 ept 的登录会话文件动态读取，ept 刷新登录后无需改动本脚本。
"""
import json
import os

sess_path = os.path.expanduser(r"~/.config/ept/auth_session.json")
with open(sess_path, encoding="utf-8") as f:
    sess = json.load(f)
token = sess.get("portal_token") or sess.get("access_token") or ""
print(token)
