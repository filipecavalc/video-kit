"""Pipeline diagram for the video-kit example: one box per stage, drawn in order."""
from manim import (
    DOWN, UP, Arrow, FadeIn, GrowArrow, RoundedRectangle, Scene, Text, VGroup, config, Create, Write,
)
from vk_manim import THEME, content_area, fit_frame

fit_frame()
BG = THEME["bg"]
ACCENT = THEME["accent"]
TEXT = THEME["text"]
PANEL = THEME["panel"]

STAGES = [
    ("script.json", "scenes, narration, media"),
    ("Narration", "Kokoro or your cloned voice"),
    ("Captions", "Whisper, word by word"),
    ("Soundtrack", "ACE-Step, exact length"),
    ("Render", "Remotion, every format"),
]


class Flow(Scene):
    def construct(self):
        labels = [
            VGroup(
                Text(title, font_size=28, color=TEXT, weight="BOLD", font=THEME["font"]),
                Text(sub, font_size=19, color=ACCENT, font=THEME["font"]),
            ).arrange(DOWN, buff=0.08)
            for title, sub in STAGES
        ]
        # One box width for all, wide enough for the longest label; the group is scaled to fit later.
        w = max(max(l.width for l in labels) + 0.7, config.frame_width * 0.6)
        boxes = VGroup()
        for label in labels:
            box = RoundedRectangle(width=w, height=0.95, corner_radius=0.16, stroke_color=ACCENT, stroke_width=3, fill_color=PANEL, fill_opacity=1)
            boxes.add(VGroup(box, label.move_to(box)))
        boxes.arrange(DOWN, buff=0.38)
        aw, ah, cy = content_area()
        boxes.scale_to_fit_height(min(boxes.height, ah))
        if boxes.width > aw:
            boxes.scale_to_fit_width(aw)
        boxes.move_to((0, cy, 0))

        arrows = [
            Arrow(boxes[i].get_bottom(), boxes[i + 1].get_top(), buff=0.06, color=ACCENT, stroke_width=4, max_tip_length_to_length_ratio=0.35)
            for i in range(len(boxes) - 1)
        ]
        self.play(Create(boxes[0][0]), Write(boxes[0][1]), run_time=0.6)
        for i, arrow in enumerate(arrows):
            self.play(GrowArrow(arrow), run_time=0.25)
            self.play(FadeIn(boxes[i + 1], shift=UP * 0.2), run_time=0.45)
        self.wait(1.0)
