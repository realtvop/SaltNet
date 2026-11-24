/**
 * Version plates as the commands read them (design 3.3): one plate by its name (`熊極`) or the
 * label of the tab the web app shows when it joins neighbouring plates with the same requirements
 * (`熊華極` for `熊極` and `華極`). A part of a name works when only one plate or label has it.
 */
import type { VersionPlate, VersionPlateCategory } from "@core/collection/type";
import { versionPlateCategories } from "@core/collection/map";
import { getVersionPlateTabs } from "@core/collection/versionPlate";
import { resolveNamed } from "./named";

export interface PlateRef {
    /** The name or the joined label that was written, as it is in the lists. */
    readonly text: string;
    /** The plate whose requirements it stands for; the first plate of a joined label. */
    readonly plate: VersionPlate;
}

/** Every name and every joined label, category by category. */
export function listPlateRefs(
    versionPlates: Readonly<Record<VersionPlateCategory, readonly VersionPlate[]>>
): PlateRef[] {
    const refs: PlateRef[] = [];
    for (const category of versionPlateCategories) {
        const plates = versionPlates[category];
        for (const plate of plates) refs.push({ text: plate.name, plate });
        // The plates of a tab have the same requirements, so the first stands for them all.
        for (const tab of getVersionPlateTabs([...plates])) {
            const plate = plates.find(item => item.name === tab.value);
            if (plate && tab.label !== tab.value) refs.push({ text: tab.label, plate });
        }
    }
    return refs;
}

export function resolvePlate(
    versionPlates: Readonly<Record<VersionPlateCategory, readonly VersionPlate[]>>,
    text: string
): PlateRef {
    return resolveNamed(listPlateRefs(versionPlates), text, {
        noun: "牌子",
        names: ref => [ref.text],
        candidate: ref => ({ ref: ref.text, title: ref.text }),
    });
}
