# Terminator 2 Lamp Locator

An interactive lamp locator for Williams Terminator 2: Judgment Day (1991), designed for iPhone and Safari.

[Open the lamp locator](https://subnetpie.github.io/terminator2-lamp-locator/)

Search and filter the lamp inventory, tap the playfield map, and inspect lamp details. Images and data are embedded in the HTML; no build tools or external dependencies are required.

## Use locally

Download `Terminator2_Lamp_Locator_iPhone_Safari.html` and open it in a browser. On iPhone, Files Quick Look may limit JavaScript; use the hosted link in Safari for the full interactive experience. See [README.txt](README.txt) for the original iPhone instructions.

## Hosting

GitHub Pages serves this folder from the `master` branch of `subnetpie/subnetpie.github.io`. It is identical to the original downloadable HTML.

## Source

Williams Terminator 2 Judgment Day Operations Manual (1991). Controlled lamps follow factory lamp positions; flashers and GI zone locations are approximate when the manual lacks precise coordinates.

## Backglass artwork

Use **Show artwork** in the backglass panel to switch between the full-color original backglass design and a white backdrop. Lamp markers remain available in both views. The CSS toggle also works without JavaScript in browsers supporting `:has()`.

Backglass image: [Pinball Nirvana, Terminator 2 Judgment Day (Williams, 1991) BG](https://pinballnirvana.com/forums/media/terminator-2-judgment-day-williams-1991-bg.9284/), credited there to GetMoreSun and wtiger. Original artwork belongs to its respective owners.

## Portrait iPhone navigation

Use **Find a bulb** to search and filter with large touch targets. Selecting a row opens a focused result with the bulb number, type and matching diagram. The map starts enlarged and centers the selected location; **Show full map** switches to the overview. The fixed Previous / Find a bulb / Next bar steps through the current search results. Returning to search preserves the query and category. Socket details and source notes appear below the diagram.

## Illuminate by bulb type

Choose #44, #89, #555 or #906 in **Illuminate by type** to light every matching mapped point, GI zone and backbox marker at once. The list shows that type and the map opens in overview. Type selection clears search/category filters so every matching entry is included. Portrait mode shows both diagrams when the type occurs in both. Counts describe inventory entries, not physical bulb totals. Tap a marker or choose **Selected bulb only** to return to individual details.

## Lighting categories and locations

The type selector identifies #44 as controlled lamps, #89 as flashers, #555 as controlled lamps plus GI, and #906 as flashers. Choose **Table**, **Backbox**, or **Both** to scope the inventory, illumination and displayed diagrams. Table includes the cabinet start-button marker on the factory drawing. Combinations with no inventory entries show an empty state and no illuminated markers.

## Lighting help and LED advice

Tap the ⓘ beside **Bulb type** for controlled/GI/flasher explanations. Each individual bulb or type/location group gets role-specific LED advice below its diagrams. The LED ⓘ opens a sourced comparison of Comet, Tilt Graphics and Marco T2 kits. Recommendations synthesize supplier guidance and distinguish preference from product specifications; they are not an independent test. Source review: November 8, 2026.

## Backbox GI correction

The six #906 backbox markers are flashers, not the total backbox lamp inventory. GI-01 Top Insert GI and GI-05 Bottom Insert GI belong to the backbox insert board; both use #555 lamps and feed multiple physical sockets. Their former playfield polygons were removed and replaced with explicitly schematic backbox regions. There are eight backbox circuit entries, not eight physical lamps. Individual bulb totals, positions and string membership remain unverified. The original operations manual p. 2-38 marks GI-04 Not Used; a separate modern tech chart differs and was not used to overwrite the original. The original backbox assembly (p. 2-3) identifies the insert board, and the interboard table (p. 3-9) shows its GI feeds. The bottom insert feed also routes to the playfield; that physical distribution is not mapped here.

Source: https://arcarc.xmission.com/Pinball/PDF%20Pinball%20Williams%20%281979-2000%29/Terminator%202%3A%20Judgement%20Day/Terminator%202%20Judgement%20Day%20Operations%20Manual.pdf
