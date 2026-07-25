"""检查 Edge 的 protection 段和完整值"""
import json
import os

sec_path = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Secure Preferences')
with open(sec_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print('=== protection.macs 结构 ===')
macs = data.get('protection', {}).get('macs', {})
print(json.dumps(macs, indent=2, ensure_ascii=False)[:2000])

# 查找所有包含 hao123 的嵌套字符串
print('\n=== 全局搜索 hao123 ===')
json_str = json.dumps(data, ensure_ascii=False)
if 'hao123' in json_str:
    idx = json_str.index('hao123')
    print(f'Found hao123 at position {idx}:')
    start = max(0, idx - 80)
    end = min(len(json_str), idx + 80)
    print(json_str[start:end])
else:
    print('hao123 NOT FOUND in Secure Preferences')
