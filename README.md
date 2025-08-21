# Parallax Thumbnails (Obsidian Plugin)

- Badge support restored (`"badge": "4K"` or any text)
- Draggable **resize handle** for the viewer (bottom‑right). Uses CSS `resize: both` + live sync.
- External toolbar (Settings / Reset). Double‑click viewer resets pose/size/offsets.
- Modal Settings can **Copy updated JSON** or **Replace code block** in-place.
- Shift+Drag to nudge position.

## Example
```parallax
{
  "width": 360,
  "height": 200,
  "badge": "4K",
  "intensity": 16,
  "follow": 0.12,
  "align": "center",
  "scale": 1.0,
  "offsetX": 0,
  "offsetY": 0,
  "layers": [
    { "depth": -2, "src": "bg.jpg" },
    { "depth": -1, "src": "mid.jpg" },
    { "depth":  1, "src": "main.jpg" },
    { "depth":  2, "src": "fg.png" }
  ]
}
```