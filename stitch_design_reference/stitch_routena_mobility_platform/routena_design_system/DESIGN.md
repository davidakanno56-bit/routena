---
name: ROUTENA Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#4edea3'
  secondary: '#585e6f'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff4'
  on-secondary-container: '#5c6274'
  tertiary: '#446900'
  on-tertiary: '#ffffff'
  tertiary-container: '#78b300'
  on-tertiary-container: '#283f00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#dce2f6'
  secondary-fixed-dim: '#c0c6da'
  on-secondary-fixed: '#151b2a'
  on-secondary-fixed-variant: '#404757'
  tertiary-fixed: '#b2f746'
  tertiary-fixed-dim: '#98da27'
  on-tertiary-fixed: '#121f00'
  on-tertiary-fixed-variant: '#334f00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
  currency-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-md: 1.5rem
  gutter-lg: 2rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

The design system embodies an elite, craft-driven mobility standard—merging consumer ride-hailing speed with the precision and structural clarity of modern software tools. It speaks to urban commuters, corporate travelers, and campus communities in Calabar who expect effortless reliability, real-time safety, and tactile elegance.

The emotional baseline is calm composure and forward momentum: clean air, frictionless transit, and immediate clarity even under direct sunlight or late-night movement. 

Visual style balances **refined modern minimalism** with **subtle glassmorphism and tactile float**:
- Ultra-clean canvas surfaces layered over precision dark-mode or tinted slate map tiles.
- Heavy reliance on layered sheets, floating pill navigation, and frosted scrims (`backdrop-filter: blur(16px)`).
- High visual craft: razor-sharp hairline borders, luminous Emerald and Lime kinetic accents, and deep Navy typography that feels definitive and solid.
- Localized context: native representation of Nigerian Naira currency (`₦`), responsive ETA chips, and spatial indicators built for dense multi-stop city routing.

## Colors

The palette establishes high chromatic tension between deep nautical ink, luminous emerald energy, and breathable slate-tinted canvas:

- **Primary Emerald (`#10B981`)**: The actionable pulse. Applied to primary CTA buttons, verified driver checkmarks, route polylines, active transit pulses, and selected states.
- **Deep Navy (`#0B1220`)**: The premium bedrock. Forms high-contrast headlines, primary floating bottom sheets in high-focus mode, night-mode map frames, and luxury ride-tier backgrounds.
- **Accent Lime (`#A3E635`)**: The micro-signal. Reserved for real-time live tags, dynamic surge multipliers, "Arriving Now" alerts, and safety badge highlights.
- **Canvas Base (`#F8FAFC`)**: Soft, anti-glare daylight backdrop providing depth beneath floating cards.
- **Surface Elevation (`#FFFFFF`)**: Pure white layered surfaces with fine translucent borders for floating control decks, bottom sheets, and route cards.
- **Muted Slate (`#64748B`)**: Secondary typography, route connector track lines, vehicle license metadata, and inactive state borders.
- **Surface Dark (`#0F172A`) & Map Slate (`#1E293B`)**: Styled vector road tiles, route shadows, and high-fidelity night panels.

## Typography

The type system blends the contemporary, geometric friendliness of **Plus Jakarta Sans** for titles, headings, numbers, and live metric indicators with the neutral, hyper-legible utility of **Inter** for descriptions, microcopy, and form controls.

- **Currency (`₦`) Formats**: Render amounts using `currency-display` or `title-md` with `font-variant-numeric: tabular-nums`. The symbol `₦` maintains strict baseline alignment with digits.
- **Letter Spacing**: Tighten large display headlines slightly (`-0.02em` to `-0.03em`) for a confident, editorial look. Apply tracking (`+0.04em`) to uppercase status labels (`label-sm`).
- **Data Densities**: ETAs, vehicle plate formats (e.g., `CAL-482-AA`), and coordinates maintain high numeric legibility using tabular numerals.

## Layout & Spacing

The interface adopts a **map-first viewport hierarchy**:
- **Mobile (< 768px)**: The interactive map canvas operates as a full-bleed root viewport (`100dvh`). Functional UI is delivered through floating top pills (search/profile) and a tiered, gesture-friendly floating bottom-sheet docked with `margin: 1rem` above the native safe areas.
- **Desktop (>= 1024px)**: Dual-pane layout. A 440px to 480px fixed floating sidebar module sits alongside the edge on top of an expansive vector map canvas, or integrates into a structured 12-column grid system with 24px gutters.
- **Spacing Rhythm**: Governed by an 8-point spatial cadence (`0.25rem`, `0.5rem`, `1rem`, `1.5rem`, `2rem`, `3rem`). Interior card padding defaults to `space-lg` (24px) for desktop and `space-md` (16px) for compact bottom modules.

## Elevation & Depth

Visual hierarchy uses **floating contextual elevation, frosted backdrops, and luminous route glows**:

1. **Ground Zero (Canvas & Map)**: Base layer rendering dark or light slate tiles with reduced road clutter, custom high-contrast green polyline paths (`#10B981`) backed by an outer glow (`rgba(16, 185, 129, 0.35)`).
2. **Layer 1 (Card Decks & Ride-Tier Cells)**: Pure white `#FFFFFF` surfaces with subtle, crisp borders (`1px solid rgba(15, 23, 42, 0.08)`) and ambient shadows: `box-shadow: 0 4px 20px -2px rgba(11, 18, 32, 0.06), 0 2px 6px -1px rgba(11, 18, 32, 0.04)`.
3. **Layer 2 (Floating Action Modules & Bottom Sheets)**: High-altitude surface cards floating above map markers. Elevated with `box-shadow: 0 20px 40px -12px rgba(11, 18, 32, 0.16), 0 8px 16px -4px rgba(11, 18, 32, 0.08)`.
4. **Layer 3 (Glassmorphic Scrims & Pill Controls)**: Floating search inputs, floating category switchers, and map zoom toolbars: `background: rgba(255, 255, 255, 0.82)`, `backdrop-filter: blur(16px)`, `border: 1px solid rgba(255, 255, 255, 0.60)`. In dark modes, uses `rgba(11, 18, 32, 0.85)` with `border: 1px solid rgba(255, 255, 255, 0.1)`.
5. **Layer 4 (Safety Modal & Priority Alerts)**: Overlay layers using `rgba(11, 18, 32, 0.6)` blur scrim for emergency SOS, verification codes, and payment success drawers.

## Shapes

The design system utilizes **Pill-shaped (level 3)** geometry, maximizing tactile ergonomics on mobile touch screens:
- **Buttons, Badges, Search Strips, and Filter Chips**: Full pill radius (`rounded-full` / `9999px`) to invite thumb interaction and convey fluidity.
- **Bottom Sheets and Modal Drawers**: Generous upper corners with `rounded-t-[28px]` or `rounded-t-[32px]`, mirroring native mobile design standards.
- **Ride Category Cards and Transit Panels**: `rounded-2xl` (16px) to `rounded-3xl` (24px) for friendly internal layout framing.
- **Route Step Icons & Vehicle Markers**: Circular badges (`rounded-full`) anchored with drop-pin stems.

## Components

### Buttons
- **Primary Action (Book / Confirm)**: Emerald `#10B981` background, `#FFFFFF` text, bold `label-lg`, full pill radius (`rounded-full`), height 56px for effortless thumb tap. Hover: `#059669`. Active scale down to `0.98`.
- **Secondary / Ghost**: Pure White `#FFFFFF` with `#0B1220` typography, framed with a 1.5px border (`#E2E8F0`). Hover background: `#F1F5F9`.
- **Destructive / SOS**: High-alert deep crimson surface (`#EF4444`) with white typography, or soft light-red tinted pill with alert stroke.

### Input Fields & Location Pickers
- **Pickup & Dropoff Pairs**: Connected via an animated vertical hairline route stem (Emerald dot for Pickup, Deep Navy square for Destination).
- **Surface**: Light slate container (`#F1F5F9`), `rounded-2xl`, with no default heavy border; focuses into a 1.5px ring of Primary Emerald with a pure white background. Clear buttons utilize mini frosted pill badges.

### Ride Category Selector Cards
- Horizontal or vertical cards with a vehicle render (e.g., ROUTENA Eco, Comfort, Executive), dynamic arrival ETA ("3 mins away"), and clear Naira fare typography (`₦2,400`).
- **Selected State**: 2px border in `#10B981`, surface tint of `rgba(16, 185, 129, 0.04)`, with a glowing checkmark tag.

### Chips & Badges
- **Live Status Chip**: Pill badge featuring a pulsing Accent Lime (`#A3E635`) indicator dot alongside dark Navy text (`#0B1220`) over Lime-tinted background (`rgba(163, 230, 53, 0.20)`).
- **Ride Option Tags**: Split pill tags with subtle borders displaying "Fastest", "Best Value", or "EV".

### Floating Map Bottom-Sheet
- Floating detached or docked drawer containing drag-handle pill (36px × 4px in `#CBD5E1`), location history shortcuts (Marian Road, UNICAL Gate, Margaret Ekpo Airport), driver profile card, and trip progress bar.

### Driver & Trip Verification Card
- Features driver avatar, 5-star rating chip, car model & license plate container styled in high-contrast monospaced tabular formatting, alongside an encrypted 4-digit PIN verification badge for ride security.