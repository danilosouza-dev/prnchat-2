#!/usr/bin/env python3
"""
Simple script to create PNG placeholder icons using PIL
"""

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("PIL/Pillow not available. Install with: pip install Pillow")
    print("For now, the extension will use SVG icons which Chrome supports.")
    exit(0)

import os

def create_png_icon(size):
    """Create a simple PNG icon"""
    # Create a new image with transparency
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw a circle background (WhatsApp green)
    draw.ellipse([0, 0, size-1, size-1], fill='#25D366')

    # Draw a simple chat bubble in white
    bubble_margin = size // 5
    bubble_size = size - (2 * bubble_margin)
    draw.ellipse(
        [bubble_margin, bubble_margin, bubble_margin + bubble_size, bubble_margin + bubble_size],
        outline='white',
        fill='white',
        width=max(1, size // 32)
    )

    # Draw a small triangle (chat bubble tail)
    tail_size = size // 8
    tail_x = bubble_margin + bubble_size // 4
    tail_y = bubble_margin + bubble_size
    draw.polygon(
        [(tail_x, tail_y), (tail_x - tail_size, tail_y + tail_size), (tail_x + tail_size, tail_y + tail_size)],
        fill='white'
    )

    return img

def main():
    """Create PNG icon files"""
    if not PIL_AVAILABLE:
        return

    icons_dir = 'public/icons'
    os.makedirs(icons_dir, exist_ok=True)

    sizes = [16, 32, 48, 128]

    for size in sizes:
        img = create_png_icon(size)
        png_path = f'{icons_dir}/icon{size}.png'
        img.save(png_path, 'PNG')
        print(f'Created {png_path}')

    print('\n✅ PNG icons created successfully!')

if __name__ == '__main__':
    main()
