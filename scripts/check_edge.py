"""检查 Edge Secure Preferences 中的主页设置"""
import json
import os

sec_path = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Secure Preferences')
with open(sec_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Check profile section
print('=== profile section ===')
prof = data.get('profile', {})
for k in ['homepage', 'restore_on_startup', 'startup_urls', 'show_home_button']:
    if k in prof:
        val = prof[k]
        print(f'  {k}: {str(val)[:300]}')

# Check browser section
print('\n=== browser section ===')
browser = data.get('browser', {})
for k in ['homepage', 'restore_on_startup', 'startup_urls', 'show_home_button', 'last_redirect_origin']:
    if k in browser:
        val = browser[k]
        print(f'  {k}: {str(val)[:300]}')

# Search for hao123 anywhere in the file
print('\n=== searching for hao123 ===')
def search_obj(obj, path=''):
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f'{path}.{k}' if path else k
            if isinstance(v, str) and 'hao123' in v:
                print(f'  FOUND hao123 in {p}: {v[:200]}')
            else:
                search_obj(v, p)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            p = f'{path}[{i}]'
            if isinstance(v, str) and 'hao123' in v:
                print(f'  FOUND hao123 in {p}: {v[:200]}')
            else:
                search_obj(v, p)

search_obj(data)
print('\nDone.')
