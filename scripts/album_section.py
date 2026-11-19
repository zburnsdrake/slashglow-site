"""Adds the Album looks card (with the dial-in steps) to the Mood section of index.html. Safe to run twice.
Run after rebuilding the pages from the design: python3 scripts/album_section.py"""
import os
CARD = '''<div id="album-looks" style="margin-top: 18px; background: #151922; border: 1px solid #222838; border-radius: 20px; padding: 28px">
<p style="margin: 0 0 16px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, #ff3d7f, #ffb020, #20d0a0, #4a7dff)"></p>
<h3 style="margin: 0 0 10px; font-size: 22px; color: #f2f4f8">Album looks</h3>
<p style="margin: 0 0 12px; color: #a3abbd">With <b>Follow your music app</b> on, /Glow knows the album playing on your phone. <b>Album colors</b> (free) recolors your lights from the cover. <b>Album mode</b> (Pro, with your AI) gives each album a look of its own, built from its cover and feel, and plays it whenever that album comes on.</p>
<p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #8ea6ff">Dial in your album looks</p>
<ol style="margin: 0; padding-left: 22px; color: #c3cada; display: grid; gap: 6px">
<li><b>Turn on the basics:</b> Follow your music app, then Mood, then Album mode.</li>
<li><b>Import your history</b> (Pro): a Last.fm CSV or your Spotify export, 30 albums at a time. Each look starts as the AI’s read of the album.</li>
<li><b>Just listen.</b> Each imported look takes its album’s real cover colors the first time it plays. New albums get a look in about a second.</li>
<li><b>Fine-tune what bugs you</b> in Patterns → Album looks, grouped by artist. Your edits always stay, and show on the lights right away.</li>
<li><b>Pin a favorite song:</b> pick a different look while it plays, and that track keeps it.</li>
</ol>
</div>
'''
ANCHOR = '</div>\n</section>\n\n<section style="background: #10131a; border-top: 1px solid #1d2230; border-bottom: 1px solid #1d2230">\n<div style="max-width: 1180px; margin: 0 auto; padding: 80px 24px">\n<h2 style="margin: 0 0 36px; font-family: Inter, sans-serif; font-size: clamp(30px, 4vw, 44px); line-height: 1.1; letter-spacing: -0.8px; color: #f5f7fb">Set up in three steps.</h2>'
if __name__ == '__main__':
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html'); s = open(p).read()
    if 'id="album-looks"' not in s:
        assert s.count(ANCHOR) == 1, 'Mood section end not found'
        s = s.replace(ANCHOR, '</div>\n' + CARD + ANCHOR[len('</div>\n'):])
        open(p, 'w').write(s)
