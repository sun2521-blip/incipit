import type { TaskType } from "@/lib/api";
import {
  MAX_LIST_TEXT,
  parseList,
  TASK_TYPES,
  type StoredProfile,
} from "@/lib/profile";

type ProfilePanelProps = {
  profile: StoredProfile;
  onChange: (next: StoredProfile) => void;
};

export function ProfilePanel({ profile, onChange }: ProfilePanelProps) {
  const languageCount = parseList(profile.languagesText).length;
  const topicCount = parseList(profile.topicsText).length;
  const taskCount = profile.taskTypes.length;

  const summary =
    languageCount === 0 && topicCount === 0 && taskCount === 0
      ? "set it up to personalise the ranking"
      : [
          `${languageCount} ${languageCount === 1 ? "language" : "languages"}`,
          `${topicCount} ${topicCount === 1 ? "topic" : "topics"}`,
          `${taskCount} task ${taskCount === 1 ? "type" : "types"}`,
        ].join(", ");

  function toggleTask(type: TaskType) {
    onChange({
      ...profile,
      taskTypes: profile.taskTypes.includes(type)
        ? profile.taskTypes.filter((item) => item !== type)
        : [...profile.taskTypes, type],
    });
  }

  return (
    <details className="mb-6 rounded-2xl border border-[#e5e0d5] bg-white/70 p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Your profile <span className="font-normal text-[#77766d]">· {summary}</span>
      </summary>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Languages you know</span>

          <input
            value={profile.languagesText}
            onChange={(event) =>
              onChange({ ...profile, languagesText: event.target.value })
            }
            maxLength={MAX_LIST_TEXT}
            placeholder="e.g. Python, TypeScript"
            className="mt-2 w-full rounded-xl border border-[#e5e0d5] bg-white px-4 py-3 text-sm outline-none placeholder:text-[#a09b90] focus:border-[#a14e35]"
          />

          <span className="mt-1 block text-xs text-[#77766d]">
            Comma-separated, up to 10. Compared with each repository&apos;s
            main language, as reported by GitHub.
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Topics you care about</span>

          <input
            value={profile.topicsText}
            onChange={(event) =>
              onChange({ ...profile, topicsText: event.target.value })
            }
            maxLength={MAX_LIST_TEXT}
            placeholder="e.g. api, testing, machine learning"
            className="mt-2 w-full rounded-xl border border-[#e5e0d5] bg-white px-4 py-3 text-sm outline-none placeholder:text-[#a09b90] focus:border-[#a14e35]"
          />

          <span className="mt-1 block text-xs text-[#77766d]">
            Comma-separated, up to 10. Issues that mention them in the title,
            labels or description score higher.
          </span>
        </label>

        <fieldset>
          <legend className="text-sm font-medium">
            Task types you prefer
          </legend>

          <div className="mt-2 flex flex-wrap gap-2">
            {TASK_TYPES.map((type) => {
              const selected = profile.taskTypes.includes(type);

              return (
                <label
                  key={type}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs transition focus-within:ring-2 focus-within:ring-[#a14e35] ${
                    selected
                      ? "border-[#a14e35] bg-[#a14e35] text-white"
                      : "border-[#e5e0d5] bg-white hover:border-[#a14e35]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleTask(type)}
                    className="sr-only"
                  />
                  {type}
                </label>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-[#77766d]">
            Based on issue labels, which are not always accurate.
          </p>
        </fieldset>
      </div>

      <p className="mt-4 text-xs text-[#77766d]">
        Saved in this browser only.
      </p>
    </details>
  );
}
