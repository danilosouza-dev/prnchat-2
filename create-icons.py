#!/usr/bin/env python3
"""
Script to create placeholder icons for PrinChat Chrome Extension
Creates simple PNG icons in sizes: 16x16, 32x32, 48x48, 128x128
"""

import os

def create_svg_icon(size):
    """Create an SVG icon with the PrinChat logo"""
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background circle with WhatsApp green -->
  <circle cx="{size/2}" cy="{size/2}" r="{size/2}" fill="#25D366"/>

  <!-- White chat bubble icon -->
  <g transform="translate({size*0.15}, {size*0.15})">
    <path d="M {size*0.35} {size*0.05}
             C {size*0.55} {size*0.05}, {size*0.7} {size*0.2}, {size*0.7} {size*0.35}
             C {size*0.7} {size*0.5}, {size*0.55} {size*0.65}, {size*0.35} {size*0.65}
             L {size*0.15} {size*0.7}
             L {size*0.15} {size*0.5}
             C {size*0.05} {size*0.5}, 0 {size*0.43}, 0 {size*0.35}
             C 0 {size*0.2}, {size*0.15} {size*0.05}, {size*0.35} {size*0.05}
             Z"
          fill="white"/>

    <!-- Small lightning bolt for "speed/automation" -->
    <path d="M {size*0.4} {size*0.2}
             L {size*0.32} {size*0.35}
             L {size*0.38} {size*0.35}
             L {size*0.3} {size*0.5}
             L {size*0.38} {size*0.35}
             L {size*0.32} {size*0.35}
             Z"
          fill="#25D366"/>
  </g>
</svg>'''
    return svg_content

def main():
    """Create icon files"""
    # Create icons directory
    icons_dir = 'public/icons'
    os.makedirs(icons_dir, exist_ok=True)

    sizes = [16, 32, 48, 128]

    for size in sizes:
        svg_content = create_svg_icon(size)
        svg_path = f'{icons_dir}/icon{size}.svg'

        # Write SVG file
        with open(svg_path, 'w') as f:
            f.write(svg_content)

        print(f'Created {svg_path}')

    print('\n✅ SVG icons created successfully!')
    print('\nTo convert to PNG, you can use one of these methods:')
    print('1. Online converter: https://cloudconvert.com/svg-to-png')
    print('2. ImageMagick: convert icon128.svg icon128.png')
    print('3. Inkscape: inkscape icon128.svg --export-filename=icon128.png')
    print('\nFor now, Chrome will accept SVG files as well.')

if __name__ == '__main__':
    main()
