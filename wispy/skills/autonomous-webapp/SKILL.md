# Autonomous Webapp Generator

Build complete, production-ready web applications from natural language descriptions. Generates branding, images, code, and deploys - all autonomously with human approvals at key checkpoints.

## Badge
Gemini 2.5 Ultra

## Description

This skill enables fully autonomous webapp creation via Marathon Mode. Give it a high-level description like "Build me a coffee shop website with online ordering" and watch it:

1. **Design Phase**: Generate brand identity (colors, typography, logo concept)
2. **Asset Phase**: Create images with Imagen 3 (hero images, product photos, icons)
3. **Scaffold Phase**: Set up Next.js 15 + shadcn/ui + Tailwind
4. **Build Phase**: Implement all pages and components
5. **Polish Phase**: Add animations, responsive design, SEO
6. **Deploy Phase**: Preview and optional deployment

Each phase creates milestones with approval checkpoints for critical decisions.

## Tools

### create_project
Scaffold new projects (next, react, vue, express, html)

### file_write
Create and modify source files

### file_read
Read existing files for context

### image_generate
Generate images with Imagen 3 (hero images, backgrounds, product shots)

### generate_project_images
Batch generate consistent image sets for the project

### bash
Run npm/pnpm commands, git operations

### run_dev_server
Start local development server for preview

### scaffold_shadcn
Initialize shadcn/ui component library

### add_component
Add specific shadcn/ui components

### preview_and_screenshot
Capture screenshots of the webapp for approval

### send_image_to_chat
Send generated images and screenshots to user for review

### ask_user_confirmation
Request approval before major changes

### send_progress_update
Send milestone progress to Telegram

### memory_save
Save design decisions for consistency

### memory_search
Recall previous design decisions

### web_search
Research design trends and best practices

### localhost_serve
Serve the project for preview

## Workflow

### Phase 1: Discovery & Branding
```
User: "Build me a sustainable fashion e-commerce site"

Wispy creates milestones:
- m1: Research sustainable fashion design trends
- m2: Generate brand identity (colors, fonts, mood)
- m3: Create logo concepts with Imagen 3
- m4: [APPROVAL] Review brand direction
```

### Phase 2: Asset Generation
```
Milestones:
- m5: Generate hero images (models, products)
- m6: Generate product photography placeholders
- m7: Generate icons and UI elements
- m8: [APPROVAL] Review visual assets
```

### Phase 3: Development
```
Milestones:
- m9: Scaffold Next.js project
- m10: Install dependencies (shadcn, tailwind)
- m11: Create layout and navigation
- m12: Build homepage with hero section
- m13: Build product listing page
- m14: Build product detail page
- m15: Build cart and checkout flow
- m16: [APPROVAL] Review core functionality
```

### Phase 4: Polish & Deploy
```
Milestones:
- m17: Add animations and transitions
- m18: Implement responsive design
- m19: Add SEO metadata
- m20: Generate preview screenshots
- m21: [APPROVAL] Final review
- m22: Deploy to Vercel (optional)
```

## Example Prompts

### E-commerce
```
/marathon Build a sustainable fashion e-commerce site with:
- Earthy, natural color palette (sage green, cream, terracotta)
- Product categories: Clothing, Accessories, Home
- Features: Product filtering, cart, wishlist
- Generate hero images of eco-friendly fashion
- Mobile-first responsive design
```

### SaaS Landing
```
/marathon Create a SaaS landing page for an AI writing assistant:
- Modern, clean design with gradient accents
- Sections: Hero, Features, Pricing, Testimonials, FAQ
- Generate abstract AI-themed hero image
- Include animated feature demos
- Dark mode support
```

### Portfolio
```
/marathon Build a photographer portfolio website:
- Minimalist black and white theme
- Masonry image gallery
- Project case studies
- Contact form
- Generate placeholder portfolio images
```

## Branding Generation

The skill generates comprehensive brand guidelines:

```json
{
  "brand": {
    "name": "EcoThread",
    "tagline": "Sustainable Style for Tomorrow",
    "colors": {
      "primary": "#4A7C59",
      "secondary": "#E8DCC4",
      "accent": "#C17F59",
      "background": "#FAFAF8",
      "text": "#2D3436"
    },
    "typography": {
      "heading": "Playfair Display",
      "body": "Inter",
      "accent": "DM Sans"
    },
    "mood": ["natural", "elegant", "sustainable", "modern"]
  }
}
```

## Image Generation Prompts

The skill crafts optimized Imagen 3 prompts:

```
Hero Image: "Professional product photography of sustainable
cotton clothing on wooden hangers, soft natural lighting,
sage green and cream color palette, minimalist studio
background, 16:9 aspect ratio, editorial fashion style"

Product Shot: "Flatlay of organic cotton t-shirt in sage green,
eucalyptus leaves as props, cream linen background, soft
shadows, product photography, square format"
```

## Approval Checkpoints

Critical decisions trigger inline approval buttons in Telegram:

```
🎨 Brand Direction Ready

I've created a brand identity for EcoThread:

Colors: Sage Green (#4A7C59), Cream, Terracotta
Typography: Playfair Display + Inter
Mood: Natural, Elegant, Sustainable

[📸 View Brand Board] [✅ Approve] [🔄 Regenerate]
```

## Requirements

- Gemini API key with Imagen 3 access
- Node.js 20+ for project scaffolding
- Telegram bot configured for approvals (recommended)

## Tips

1. **Be specific about style**: "modern minimalist" vs "playful colorful"
2. **Mention target audience**: "for Gen Z" vs "for enterprise"
3. **Include color preferences**: "blue and white" or "earthy tones"
4. **Specify features explicitly**: "with dark mode" or "with animations"
5. **Use Marathon Mode**: Start with `/marathon` for full autonomous execution
