"""Puts the sign-up questions into the beta, iPhone and home waitlist forms of index.html and cars.html.
The names match GLOW_SITE in assets/site.js and the Google Forms' questions (choices must match exactly).
Run after rebuilding the pages from the design: python3 scripts/signup_fields.py"""
import re, sys, os
S = 'font: inherit; color: #e9ecf3; background: #0f121a; border: 1px solid #2a3142; border-radius: 12px; padding: 14px 16px'
L = 'font-size: 14px; color: #b7bfd1'
def inp(id_, name, label, ph, req=False, typ='text', ac=''):
    a = f' autocomplete="{ac}"' if ac else ''
    return f'<label for="{id_}" style="{L}">{label}</label>\n<input id="{id_}" name="{name}"{" required" if req else ""}{a} type="{typ}" placeholder="{ph}" style="{S}">\n'
MUSIC = ['Spotify', 'Tidal', 'YouTube Music', 'Apple Music', 'Amazon Music', "The car's own apps"]
music = (f'<fieldset style="border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 14px"><legend style="{L}; margin-bottom: 8px">Music apps you use (optional)</legend>'
    + ''.join(f'<label style="display: inline-flex; gap: 6px; align-items: center; color: #c3cada; font-size: 15px"><input type="checkbox" name="music" value="{m.replace(chr(39), "&#39;")}"> {m.replace(chr(39), "’")}</label>' for m in MUSIC) + '</fieldset>\n')
weekly = '<label style="display: inline-flex; gap: 8px; align-items: center; color: #c3cada; font-size: 15px"><input type="checkbox" name="weekly" value="I can try new builds weekly and send a log"> I can try new builds weekly and send a log</label>\n'
later = '<label style="display: inline-flex; gap: 8px; align-items: center; color: #c3cada; font-size: 15px"><input type="checkbox" name="later" value="I&#39;d also like to test home lights (TV, desk, room) later"> I’d also like to test home lights (TV, desk, room) later</label>\n'
# The beta is for car lights for now (any car, any kit); home lights come later, so people can opt in to hear about it.
BETA = (inp('beta-email', 'email', 'Google account email (the one signed in to Play Store)', 'you@gmail.com', True, 'email', 'email')
    + inp('beta-car', 'car', 'Car: make, model and year', 'e.g. 2024 Tesla Model Y', True)
    + inp('beta-kit', 'kit', 'Light kit: brand, and the app it uses today', 'e.g. LightingBugTech, LED LAMP app', True)
    + inp('beta-phone', 'phone', 'Phone model', 'e.g. Pixel 10 Pro XL, Galaxy S25', True)
    + music + weekly + later
    + inp('beta-heard', 'heard', 'How did you hear about /Glow? (optional)', 'e.g. r/TeslaModelY'))
HEAD = ('<h2 style="margin: 0; font-family: Inter, sans-serif; font-size: 32px; letter-spacing: -0.5px; color: #f5f7fb">Join the car beta (Android)</h2>\n'
    '<p style="margin: 0; color: #b7bfd1">Any car, any Bluetooth light kit. Use the Google account on your Android phone: you’ll get an invite to test /Glow from Google Play. Home lights come next.</p>\n')
IOS = (inp('ios-email', 'email', 'Email', 'you@icloud.com', True, 'email', 'email')
    + inp('ios-kit', 'kit', 'Your lights (optional)', 'e.g. car kit by LightingBugTech')
    + inp('ios-car', 'car', 'Car, if they’re in one (optional)', 'e.g. 2024 Tesla Model Y'))
# Home lights waitlist (its own Google Form, '/Glow home lights waitlist'; choices must match the form's).
WHAT = ['TV or media center', 'Desk or gaming setup', 'Room or ceiling', 'Holiday or outdoor lights', 'Something else']
what = (f'<fieldset style="border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 14px"><legend style="{L}; margin-bottom: 8px">What would you light? (optional)</legend>'
    + ''.join(f'<label style="display: inline-flex; gap: 6px; align-items: center; color: #c3cada; font-size: 15px"><input type="checkbox" name="what" value="{w}"> {w}</label>' for w in WHAT) + '</fieldset>\n')
HOME = (inp('home-email', 'email', 'Email', 'you@example.com', True, 'email', 'email')
    + what
    + inp('home-lights', 'lights', 'Lights or kit you have now (optional)', 'e.g. TV backlight, SP630E, LED LAMP app')
    + inp('home-phone', 'phone', 'Phone (optional)', 'e.g. Pixel 10 Pro XL, Galaxy S25')
    + inp('home-heard', 'heard', 'How did you hear about /Glow? (optional)', 'e.g. r/homeassistant'))
def fix(html):
    html = re.sub(r'(<form data-form="beta"[^>]*>\n?)<h2.*?</p>\n<label for="beta-email".*?(?=<button type="submit")', lambda m: m.group(1) + HEAD + BETA, html, flags=re.S)
    html = re.sub(r'(<form data-form="iphone"[^>]*>.*?</p>\n)<label for="ios-email".*?(?=<button type="submit")', lambda m: m.group(1) + IOS, html, flags=re.S)
    return re.sub(r'(<form data-form="home"[^>]*>.*?</p>\n)<label for="home-email".*?(?=<button type="submit")', lambda m: m.group(1) + HOME, html, flags=re.S)
if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    for f in ['index.html', 'cars.html']:
        p = os.path.join(root, f); s = open(p).read(); open(p, 'w').write(fix(s))
