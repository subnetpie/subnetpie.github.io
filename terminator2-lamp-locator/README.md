# T2 Lamp Locator — evidence audit

[Open the locator](https://subnetpie.github.io/terminator2-lamp-locator/) · [Read the complete audit](https://subnetpie.github.io/terminator2-lamp-locator/validation-audit.html)

The location layer was audited November 8, 2026 after unsupported bulb positions were reported. All 83 original inventory rows and every marker/region class were reviewed. The app now contains 81 records: 63 controlled references, 16 area-specific flasher records, and 2 aggregate GI inventory records. Records are not physical bulb totals.

## Supported and unsupported locations

61 controlled references retain 63 manually retraced feature markers from factory manual p. 2-35. A marker identifies a drawn insert/feature, not an inspected under-playfield bulb-holder center. L52 is inside a skull assembly and L84 is on the cabinet; neither is assigned an invented table socket point.

All 17 table-flasher points, six backbox-flasher dots, four GI regions and 21 numbered photo overlays were removed. They had no verified per-socket location evidence. The unannotated photo and contextual artwork remain available. Flasher circuits and printed quantities remain documented in the inventory without invented coordinates.

## Source conflicts

- Upper eyes L52: two lamps are shown in the skull assembly. Manual p. 2-27 and the reproduced assembly BOM specify #555 wedge sockets; p. 2-35 says #44. Supplier documentation reports both variants. Inspect the installed sockets before ordering. No definite replacement is selected automatically.
- Mouth 2 L17 and Eyes Lower L51 are drawn playfield features. They no longer receive upper-skull LED advice based on their names.
- GI labels differ within the manual: p. 2-38 and p. 2-39 disagree about outputs 02, 04 and 05. GI 04 is not asserted fitted or absent. The app uses aggregate GI records instead of pretending these circuit labels establish socket routing.
- Playfield GI includes #44 socket assemblies and #555 lamp boards in the reproduced BOM. The former blanket #555 shaded polygons were not a complete physical inventory and were removed.
- The 50013-IN insert-panel BOM lists 37 #555 bulbs and six #906 flashers (43 total), with matching socket quantities. No per-socket circuit assignments follow from that total.

## Audit artifacts

`validation-audit.html`, `.json` and `.csv` contain every original row, status, source references, old/new values and retained feature coordinates. The report distinguishes documentation review from physical inspection. The actual machine’s installed bulbs, modifications, socket types and wire-to-lamp mapping cannot be fully validated from the available photo and documents alone.

## Sources

- [Original Williams manual](https://arcarc.xmission.com/Pinball/PDF%20Pinball%20Williams%20%281979-2000%29/Terminator%202%3A%20Judgement%20Day/Terminator%202%20Judgement%20Day%20Operations%20Manual.pdf): pp. 2-13, 2-27, 2-35, 2-38, 2-39, 3-9.
- [Reproduced T2 parts BOM](https://www.moll.no/pinball/jsparts/T2.php).
- [Pinball Life upper-eye socket variants](https://www.pinballlife.com/briteeyes-terminator-eye-mod-for-terminator-2-pinball-machines.html).

Both HTML files are identical self-contained locator copies. The audit is linked as separate files. GitHub Pages serves this folder from `master` in `subnetpie/subnetpie.github.io`.
