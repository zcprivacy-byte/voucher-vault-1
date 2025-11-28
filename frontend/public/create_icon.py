from PIL import Image, ImageDraw, ImageFont

def create_icon(size, filename):
    # Create image with gradient-like background
    img = Image.new('RGB', (size, size), color='#66bb6a')
    draw = ImageDraw.Draw(img)
    
    # Draw a ticket-like shape
    margin = size // 6
    ticket_color = '#ffffff'
    
    # Main rectangle
    draw.rectangle([margin, margin, size-margin, size-margin], 
                   fill=ticket_color, outline='#81c784', width=size//40)
    
    # Notches on sides
    notch_size = size // 10
    notch_y = size // 2
    draw.ellipse([margin-notch_size//2, notch_y-notch_size//2, 
                  margin+notch_size//2, notch_y+notch_size//2], 
                 fill='#66bb6a')
    draw.ellipse([size-margin-notch_size//2, notch_y-notch_size//2, 
                  size-margin+notch_size//2, notch_y+notch_size//2], 
                 fill='#66bb6a')
    
    # Draw "V" letter
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size//3)
    except:
        font = ImageFont.load_default()
    
    text = "V"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - size // 20
    
    draw.text((x, y), text, fill='#2e7d32', font=font)
    
    img.save(filename)
    print(f"Created {filename}")

create_icon(192, 'icon-192.png')
create_icon(512, 'icon-512.png')
