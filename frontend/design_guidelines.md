# Saral Job Viewer - Design Guidelines

## Design Approach: Utility-Focused Design System
**System Selected:** Custom dark-themed system optimized for productivity and data-dense content
**Rationale:** Job listing applications prioritize efficiency, scannability, and functionality over visual flourishes. Users need to quickly process multiple job postings, making clarity and readability paramount.

## Core Design Principles
1. **Mobile-First Responsive:** Every element optimized for touch and small screens first
2. **Dark Theme Excellence:** Professional dark palette reducing eye strain during extended browsing
3. **Information Density:** Maximum content visibility without overwhelming users
4. **Touch-Friendly:** 44px minimum touch targets across all interactive elements

---

## Color Palette

### Dark Mode (Primary)
- **Background Primary:** 217 19% 12% (Deep charcoal base)
- **Background Secondary:** 217 19% 18% (Elevated surfaces - cards, modals)
- **Background Tertiary:** 217 19% 24% (Hover states, input fields)
- **Text Primary:** 0 0% 95% (High contrast white for readability)
- **Text Secondary:** 0 0% 70% (Muted text for descriptions, metadata)
- **Text Tertiary:** 0 0% 50% (Disabled states, placeholders)

### Accent Colors
- **Primary Action:** 217 91% 60% (Vibrant blue for CTAs, links)
- **Primary Hover:** 217 91% 55% (Slightly darker for interactions)
- **Success:** 142 71% 45% (Green for confirmations, positive actions)
- **Danger:** 0 84% 60% (Red for delete, blacklist actions)
- **Warning:** 45 93% 47% (Amber for important notices)

### Borders & Dividers
- **Border Light:** 217 19% 30% (Subtle card borders)
- **Border Medium:** 217 19% 40% (Input borders, separators)
- **Border Focus:** 217 91% 60% (Active input states)

---

## Typography

### Font Family
**Primary:** -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif
**Rationale:** System fonts ensure optimal rendering and performance across devices

### Type Scale (Mobile-First)
- **H1 (Page Title):** 1.5rem mobile / 2rem desktop, font-weight 700
- **H2 (Section Headers):** 1.25rem mobile / 1.5rem desktop, font-weight 600
- **H3 (Card Titles):** 1.1rem mobile / 1.25rem desktop, font-weight 600
- **Body (Descriptions):** 0.9rem mobile / 1rem desktop, font-weight 400
- **Small (Metadata):** 0.75rem mobile / 0.875rem desktop, font-weight 400
- **Tiny (Timestamps):** 0.7rem mobile / 0.8rem desktop, font-weight 400

### Line Heights
- Headers: 1.2 (tight for compact headers)
- Body text: 1.6 (comfortable reading)
- Descriptions: 1.7 (enhanced readability for long content)

---

## Layout System

### Spacing Scale
**Consistent Tailwind Units:** 2, 3, 4, 6, 8, 12, 16, 20, 24
- **Micro spacing (p-2, gap-2):** 0.5rem - Tight element grouping
- **Small spacing (p-3, p-4):** 0.75rem-1rem - Card internal padding, button padding
- **Medium spacing (p-6, p-8):** 1.5rem-2rem - Section padding, modal padding
- **Large spacing (py-12, py-16):** 3rem-4rem - Major section separation

### Responsive Breakpoints
- **Mobile:** 360px-480px (base styling, single column)
- **Tablet:** 481px-767px (sm: prefix, optimized navigation)
- **Laptop:** 768px-1399px (md: prefix, two-column where appropriate)
- **Desktop:** 1400px+ (lg: prefix, three-column grids, max-width constraints)

### Container Strategy
- **Max Width:** max-w-7xl (1280px) centered with mx-auto
- **Padding:** px-4 mobile / px-6 tablet / px-8 desktop
- **Content Sections:** Full-width backgrounds with contained content

---

## Component Library

### Navigation Header
- **Height:** 60px mobile / 70px desktop
- **Layout:** Horizontal flex with space-between
- **Elements:** Logo/title (left), refresh + keywords buttons (right)
- **Background:** Background Secondary with bottom border
- **Sticky:** position: sticky, top: 0, z-index: 50

### Search Bar
- **Full-width:** w-full with max-width constraints on desktop (max-w-2xl)
- **Input Style:** bg-tertiary, rounded-lg, px-4 py-3, border on focus
- **Clear Button:** Absolute positioned right-3, only shown when text present
- **Mobile:** Larger touch target (h-12), prominent placement below header

### Filter Dropdown
- **Time Options:** Horizontal pills on mobile (flex-wrap), dropdown on desktop
- **Active State:** Primary accent background, bold text
- **Touch Target:** min-h-11 (44px) for mobile accessibility
- **Position:** Below search, sticky on scroll

### Job Cards Grid
- **Layout:** Single column mobile, 2 columns tablet, 3 columns desktop
- **Card Structure:**
  - Header: Job title (H3) + timestamp (small, text-secondary)
  - Meta row: Company name + location + job type (badges)
  - Actions: Apply link + company blacklist button
  - Description: Truncated with "Show More" expansion
- **Card Styling:** bg-secondary, rounded-xl, p-4 mobile / p-6 desktop, border-light
- **Hover State:** Subtle transform scale(1.01), border-medium transition

### Keywords Modal
- **Overlay:** Fixed inset-0, bg-black/70 backdrop-blur-sm
- **Dialog:** Centered, max-w-2xl, bg-secondary, rounded-2xl, p-6
- **Tabs:** Search Terms / Company Blacklist with underline indicator
- **List Items:** Flex justify-between, hover:bg-tertiary, rounded-lg
- **Add Form:** Input + select dropdown + submit button in horizontal layout

### Buttons
- **Primary CTA:** bg-primary, text-white, px-6 py-3, rounded-lg, font-semibold
- **Secondary:** border-2 border-primary, text-primary, transparent bg
- **Danger:** bg-danger, text-white (for delete/blacklist)
- **Icon Buttons:** Square 44x44px touch targets, centered icon
- **Hover:** opacity-90 + subtle scale(1.02) transform

### Form Inputs
- **Text Input:** bg-tertiary, border border-medium, focus:border-focus, rounded-lg, px-4 py-3
- **Select Dropdown:** Same styling as input, custom arrow icon
- **Search Input:** Includes search icon (left) and clear button (right)

### Loading States
- **Skeleton Cards:** Animate-pulse gradient from bg-secondary to bg-tertiary
- **Spinner:** Border-4 border-primary with transparent partial circle, animate-spin
- **Overlay:** Semi-transparent bg-black/50 with centered spinner

---

## Animations & Interactions

**Principle:** Subtle, purposeful animations that enhance UX without distraction

### Micro-Interactions
- **Button Hover:** 150ms ease-in-out opacity + transform
- **Card Hover:** 200ms ease transform scale
- **Modal Entry:** 300ms ease-out slide-up from bottom (mobile) / fade-in (desktop)
- **Tab Switch:** 200ms ease border-bottom slide animation

### Transitions
- **Background Changes:** 150ms ease-in-out
- **Border Colors:** 200ms ease
- **Text Color:** 150ms ease
- **Avoid:** Distracting rotations, excessive bounces, slow animations >500ms

---

## Accessibility & UX

### Touch Optimization
- **Minimum Touch Target:** 44px x 44px for all interactive elements
- **Spacing Between Targets:** Minimum 8px gap to prevent mis-taps
- **Visual Feedback:** Immediate bg/border change on touch/click

### Keyboard Navigation
- **Focus Rings:** 2px solid primary color with offset
- **Tab Order:** Logical flow through header → search → filters → jobs → modals
- **Escape Key:** Closes all modals and dropdowns

### Screen Reader Support
- **ARIA Labels:** All icon buttons and interactive elements
- **Live Regions:** Job count and search results announcements
- **Semantic HTML:** Proper heading hierarchy, nav, main, article tags

### Empty & Error States
- **No Results:** Centered message with search suggestions, muted text
- **Loading:** Full-screen or section-specific skeleton loaders
- **Error:** Red accent border on failed inputs, inline error messages

---

## Images

**Hero Section:** Not applicable - utility-focused job listing interface
**Icons:** Heroicons via CDN for search, filter, delete, external link, clock icons
**Company Logos:** Not implemented (optional future enhancement via API)