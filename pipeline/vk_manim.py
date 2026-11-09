"""Import this at the top of a Manim scene file used by the video kit:

    from vk_manim import THEME, fit_frame
    fit_frame()

Manim keeps a 16:9 logical frame even when rendering portrait pixels, so content ends up tiny
in 4x5 / 9x16 videos. fit_frame() matches the logical frame to the pixel aspect ratio.
The pipeline puts this folder on PYTHONPATH and passes the theme in VK_THEME.
"""
import json
import os
from pathlib import Path

from manim import config

# Same fonts as the Remotion templates (open source, in tools/fonts), registered for this process.
try:
    import manimpango

    for _ttf in (Path(__file__).resolve().parent.parent / "tools" / "fonts").glob("*.ttf"):
        manimpango.register_font(str(_ttf))
except Exception:  # fonts are a nicety; Manim falls back to a system font
    pass

# caption_y: where the burned-in captions sit (fraction of frame height from the top), mirrors
# caption.position in remotion/src/styles.ts: 0.08 + 0.84 * position.
THEMES = {
    "clean": {"bg": "#0E1116", "panel": "#1B2230", "accent": "#F5A524", "text": "#E8EDF2", "font": "Inter", "caption_y": 0.80},
    "bold": {"bg": "#111111", "panel": "#2A2A2A", "accent": "#FFD400", "text": "#FFFFFF", "font": "Montserrat", "caption_y": 0.685},
    "tech": {"bg": "#0A0F14", "panel": "#13202B", "accent": "#3DDC97", "text": "#E8EDF2", "font": "JetBrains Mono", "caption_y": 0.80},
    "midnight": {"bg": "#0B0D1F", "panel": "#1A1640", "accent": "#8B5CF6", "text": "#EEF0FF", "font": "Inter", "caption_y": 0.80},
    "editorial": {"bg": "#16120F", "panel": "#2A231C", "accent": "#E8B04A", "text": "#F4EDE4", "font": "Inter", "caption_y": 0.80},
}

_env = json.loads(os.environ.get("VK_THEME", "{}") or "{}")
THEME = {**THEMES.get(_env.get("style", "clean"), THEMES["clean"]), **({"accent": _env["accent"]} if _env.get("accent") else {})}


def fit_frame(height: float = 8.0) -> None:
    config.frame_height = height
    config.frame_width = height * config.pixel_width / config.pixel_height
    config.background_color = THEME["bg"]


def content_area() -> tuple[float, float, float]:
    """(width, height, center_y) of the area free of burned-in captions and headline.

    Content stays above the caption line of the current style.
    Fit a group into it with:  g.scale_to_fit_height(min(g.height, h)); g.move_to((0, cy, 0))
    and check g.width <= w.
    """
    H, W = config.frame_height, config.frame_width
    top, bottom = H / 2 - H * 0.05, H / 2 - H * (THEME["caption_y"] - 0.08)
    return W * 0.88, top - bottom, (top + bottom) / 2
