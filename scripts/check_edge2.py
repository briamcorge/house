"""检查 Edge Secure Preferences 的完整结构"""
import json
import os

sec_path = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Secure Preferences')
with open(sec_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Print top-level keys
print('=== Top-level keys ===')
for k in data.keys():
    val = data[k]
    if isinstance(val, dict):
        print(f'  {k}: dict ({len(val)} keys) -> {list(val.keys())[:10]}')
    elif isinstance(val, list):
        print(f'  {k}: list ({len(val)} items)')
    elif isinstance(val, str):
        print(f'  {k}: str ({len(val)} chars) -> {val[:80]}')
    elif isinstance(val, bool):
        print(f'  {k}: bool -> {val}')
    elif isinstance(val, int):
        print(f'  {k}: int -> {val}')
    else:
        print(f'  {k}: {type(val).__name__}')

# Check if there's a protected/settings section  
for section_key in ['protected', 'settings', 'preference_hashes']:
    if section_key in data:
        print(f'\n=== {section_key} ===')
        print(json.dumps(data[section_key], indent=2)[:1000])

# Also check the Preferences file (not Secure) for startup settings
print('\n=== checking regular Preferences ===')
pref_path = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Preferences')
with open(pref_path, 'r', encoding='utf-8') as f:
    prefs = json.load(f)

# Look for startup settings
for section in ['session', 'prefs']:
    if section in prefs:
        print(f'\n--- {section} ---')
        print(json.dumps(prefs[section], indent=2)[:500])
