"""读取 Edge Secure Preferences 中的启动设置"""
import json
import os

sec_path = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Secure Preferences')
with open(sec_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print('=== ess_kv_states ===')
print(json.dumps(data['ess_kv_states'], indent=2, ensure_ascii=False))

print('\n=== session ===')
print(json.dumps(data['session'], indent=2, ensure_ascii=False))
