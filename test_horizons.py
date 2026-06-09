import requests
from datetime import datetime, timezone, timedelta

now = datetime.now(timezone.utc)
today = now.strftime('%Y-%m-%d')
tomorrow = (now + timedelta(days=1)).strftime('%Y-%m-%d')

url = (
    'https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND=-1024&OBJ_DATA=NO'
    '&MAKE_EPHEM=YES&EPHEM_TYPE=OBSERVER&CENTER=coord@399'
    f'&SITE_COORD=%270.9272%2C43.4934%2C0.190%27'
    f'&START_TIME={today}&STOP_TIME={tomorrow}'
    '&STEP_SIZE=1h&QUANTITIES=4'
)

print('URL:', url)
print()
r = requests.get(url, timeout=15)
print(r.text[:1000])
