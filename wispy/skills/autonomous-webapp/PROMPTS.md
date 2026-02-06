# Autonomous Webapp Generation Prompts

## Marathon Planning Prompt

When a user requests a webapp via `/marathon`, use this enhanced planning approach:

```
You are building a complete production webapp. Break this into phases:

PHASE 1: DISCOVERY & BRANDING (Milestones 1-4)
- Research design trends for this industry
- Define brand identity (colors, typography, mood)
- Generate logo concepts with Imagen 3
- [CHECKPOINT] Send brand board to user for approval

PHASE 2: ASSET GENERATION (Milestones 5-8)
- Generate hero images matching the brand
- Generate product/feature images
- Create icons and UI elements
- [CHECKPOINT] Send asset gallery for approval

PHASE 3: DEVELOPMENT (Milestones 9-16)
- Scaffold Next.js 15 project
- Install dependencies (shadcn/ui, tailwind, framer-motion)
- Create layout and navigation components
- Build homepage with animated hero
- Build secondary pages
- Implement interactive features
- [CHECKPOINT] Send screenshot for approval

PHASE 4: POLISH & DEPLOY (Milestones 17-22)
- Add micro-interactions and animations
- Implement responsive design
- Add SEO metadata and Open Graph images
- Run accessibility checks
- Generate final screenshots
- [CHECKPOINT] Final approval before deploy
- Deploy to Vercel (if approved)

Each [CHECKPOINT] milestone must:
1. Generate visual preview (screenshot or image)
2. Send to user via send_image_to_chat
3. Use ask_user_confirmation with inline buttons
4. Wait for approval before continuing
```

## Brand Generation Prompt

When generating brand identity:

```
Create a comprehensive brand identity for: {project_description}

Generate as JSON:
{
  "brand": {
    "name": "<brand name suggestion>",
    "tagline": "<memorable tagline>",
    "voice": "<brand personality: professional/playful/bold/etc>",
    "colors": {
      "primary": "#hex - <psychological reasoning>",
      "secondary": "#hex - <complements primary>",
      "accent": "#hex - <for CTAs and highlights>",
      "background": "#hex - <light or dark base>",
      "text": "#hex - <readable contrast>",
      "muted": "#hex - <subtle elements>"
    },
    "typography": {
      "heading": "<Google Font name>",
      "body": "<Google Font name>",
      "mono": "<monospace font if needed>"
    },
    "mood": ["<adjective>", "<adjective>", "<adjective>"],
    "targetAudience": "<who this is for>",
    "competitors": ["<reference site 1>", "<reference site 2>"]
  }
}

Consider:
- Industry conventions (finance=blue, health=green, etc)
- Target audience age and preferences
- Accessibility (color contrast ratios)
- Current design trends (2024-2025)
```

## Imagen 3 Prompt Templates

### Hero Image
```
Professional {style} hero image for {industry} website.
{subject_description}.
{color_palette} color scheme.
{lighting_description} lighting.
{composition} composition.
High-end {genre} photography style.
16:9 aspect ratio.
No text, no logos, no watermarks.
```

### Product Photography
```
Studio product photography of {product}.
{material_description} material.
{background_description} background.
{prop_description} as subtle props.
Soft professional lighting with gentle shadows.
Clean, minimal, editorial style.
Square 1:1 aspect ratio.
```

### Abstract/Tech
```
Abstract {concept} visualization.
{color_1} and {color_2} gradient tones.
{texture_description} texture.
Futuristic, modern aesthetic.
Subtle {effect} effects.
Professional tech company style.
16:9 aspect ratio.
```

### Lifestyle
```
Authentic lifestyle photography showing {scene}.
{demographic} subject(s).
{environment} setting.
{mood} mood with {lighting} lighting.
{color_treatment} color treatment.
Editorial magazine style.
Natural, unposed feeling.
```

## Component Generation Prompt

When building UI components:

```
Create a {component_name} component using:
- React 19 with TypeScript
- shadcn/ui as the base (import from @/components/ui)
- Tailwind CSS for styling
- Framer Motion for animations
- The brand colors defined in tailwind.config.ts

Requirements:
1. Fully responsive (mobile-first)
2. Accessible (ARIA labels, keyboard navigation)
3. Animated (subtle micro-interactions)
4. Match the brand identity exactly

Brand reference:
- Primary: {primary_color}
- Accent: {accent_color}
- Font: {heading_font}
- Mood: {brand_mood}

Output the complete component file.
```

## Progress Update Messages

Send human-like progress updates:

### Starting Phase
```
💭 Alright, starting on {phase_name}!

I'll be working on:
{bullet_list_of_milestones}

This should take about {estimated_time}. I'll ping you when I need your input!
```

### Milestone Complete
```
✅ {milestone_title} - done!

{brief_description_of_what_was_accomplished}

{artifact_list_if_any}

Moving on to {next_milestone}...
```

### Checkpoint Approval
```
🎨 {checkpoint_name} Ready for Review

{description_of_what_to_review}

[View the attached {image_type}]

Does this direction work for you?

[✅ Looks great!] [🔄 Try again] [💬 Feedback]
```

### Error Recovery
```
⚠️ Hit a snag with {milestone_title}

{error_description}

I'm going to try:
{recovery_plan}

{retry_count}/3 attempts remaining.
```

### Marathon Complete
```
🎉 All done!

Your {project_type} is ready:

📊 Stats:
- {milestone_count} milestones completed
- {image_count} images generated
- {file_count} files created
- {time_taken} total time

📁 Project: {project_path}

🌐 Preview: {preview_url}

What would you like to do next?
[🚀 Deploy to Vercel] [📝 Make changes] [📦 Download ZIP]
```

## Tailwind Config Template

```javascript
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "{primary}",
          secondary: "{secondary}",
          accent: "{accent}",
          background: "{background}",
          foreground: "{text}",
          muted: "{muted}",
        },
      },
      fontFamily: {
        heading: ["{heading_font}", "serif"],
        body: ["{body_font}", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

## Demo-Ready Features

For the hackathon demo, ensure these work flawlessly:

1. **Voice Command**: User can send voice note "Build me a coffee shop website"
2. **Thought Signatures**: Every action shows reasoning in Telegram
3. **Image Generation**: Imagen 3 creates actual hero images, not placeholders
4. **Live Screenshots**: Preview sent as images in chat
5. **Approval Buttons**: Inline keyboard for critical checkpoints
6. **Marathon Progress**: Real-time milestone updates
7. **Final Deploy**: One-click Vercel deployment option
