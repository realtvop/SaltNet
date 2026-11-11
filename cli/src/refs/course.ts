/**
 * Dan courses as the commands read them (design 3.1): the course id (`551010`), the name (`十段`,
 * `真皆伝`), or a part of a name that only one course has (`真九`).
 */
import type { Course } from "@core/course";
import { courses } from "@core/course";
import { resolveNamed } from "./named";

export function resolveCourse(text: string, list: readonly Course[] = courses): Course {
    return resolveNamed(list, text, {
        noun: "段位",
        names: course => [String(course.id), course.name],
        // Only the name has parts worth matching; `55` is not a piece of an id anyone means.
        partialNames: course => [course.name],
        candidate: course => ({ ref: course.name, title: course.name }),
    });
}
