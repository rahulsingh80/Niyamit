import React from "react";

interface HelpPageProps {
  onClose: () => void;
}

export const HelpPage: React.FC<HelpPageProps> = ({ onClose }) => {
  return (
    <div className="help-page">
      <div className="help-header">
        <h1>Niyamit Help</h1>
        <button type="button" className="secondary" onClick={onClose}>
          Back to app
        </button>
      </div>

      <div className="help-content">
        <section>
          <h2>What is Niyamit?</h2>
          <p>
            Niyamit is an offline-first task manager. Your data lives as JSON—in your browser&apos;s
            local storage and optionally in a folder named <strong>Niyamit</strong> in your Google
            Drive. The app works offline and syncs when you&apos;re online.
          </p>
        </section>

        <section>
          <h2>Task list layout</h2>
          <p>The main view shows tasks grouped by date:</p>
          <ul>
            <li><strong>OVERDUE</strong> — All tasks due before today (with a gentle highlight).</li>
            <li><strong>TODAY</strong>, <strong>TOMORROW</strong>, and the <strong>next 5 days</strong> — Each day is always shown, even if it has no tasks.</li>
            <li><strong>LATER</strong> — Tasks due after the next 7 days; each still appears under its due date.</li>
            <li><strong>NO DUE DATE</strong> — Tasks with no due date, at the end.</li>
          </ul>
          <p>
            Within a day, tasks are sorted by priority (P1 first), then by due time. Tasks with no
            time appear below others of the same priority. You can <strong>drag a task</strong> to
            another day to change its due date (time is kept). You cannot drag into OVERDUE.
          </p>
        </section>

        <section>
          <h2>Creating tasks</h2>
          <ul>
            <li>Click <strong>Create Task</strong> in the left panel to open the form. The form expands and the task list moves to the right.</li>
            <li>Use the <strong>Title</strong>, <strong>When</strong> (date/time or recurring), <strong>Time</strong>, and <strong>Priority</strong> fields. Press <strong>Enter</strong> in the Title to create the task.</li>
            <li>You can set <strong>date</strong>, <strong>time</strong>, <strong>priority</strong>, <strong>project</strong>, <strong>reminder</strong>, and <strong>tags</strong> by typing shortcuts at the <strong>end of the title</strong> (see below). Matched text is highlighted; you can override with the form fields.</li>
          </ul>
        </section>

        <section>
          <h2>Title shortcuts (at the end of the title)</h2>
          <p>
            These only apply when they appear at the <strong>end</strong> of the title. If you add
            more text after them, they are treated as plain text. You can mix them in any order.
          </p>

          <h3>Date and time</h3>
          <ul>
            <li><code>24 May 14:00</code> — Due on the next 24 May at 14:00.</li>
            <li><code>thu</code> or <code>thursday</code> — Due on the next Thursday.</li>
            <li><code>tod</code> / <code>tom</code> — Today / tomorrow (as whole words only).</li>
            <li><code>in 3 days</code>, <code>in 3 weeks</code>, <code>in 3 months</code>, <code>in 3 years</code> — Relative dates.</li>
            <li>Time alone: <code>14:00</code> or <code>at 14:00</code>. Date and time together: date first, then time.</li>
          </ul>

          <h3>Priority</h3>
          <ul>
            <li><code>!!1</code> … <code>!!4</code> — Sets priority (P1 = highest). Invalid values are ignored. Matched text is removed from the title when the task is created.</li>
          </ul>

          <h3>Project</h3>
          <ul>
            <li><code>#ProjectName</code> — Puts the task in that project. Autocomplete suggests existing projects; a new name creates a new project.</li>
            <li>Multi-word names: <code>#&quot;Test Proj&quot;</code> — Use double quotes after <code>#</code> for names with spaces.</li>
          </ul>

          <h3>Reminder</h3>
          <ul>
            <li>After <code>!</code>, the UI shows preset options. Examples: <code>!tom 12:00</code> (tomorrow at 12:00), <code>!30 min</code> (30 minutes before due; for tasks with a due date).</li>
            <li>If the task has only a due date and no time, 5:00 AM is used for “before due” reminders (not set on the task).</li>
          </ul>

          <h3>Tags</h3>
          <ul>
            <li><code>@tagname</code> — Adds a tag (single word, no spaces). Autocomplete suggests existing tags; new text creates a new tag.</li>
          </ul>
        </section>

        <section>
          <h2>Recurring tasks</h2>
          <p>You can set recurrence in the <strong>When</strong> section (choose “Recurring” and options like weekdays, day of month, every X days) or in the title:</p>
          <ul>
            <li><code>every tue</code>, <code>every mon, thurs at 12:30</code></li>
            <li><code>every 15 days</code></li>
            <li><code>every 10th</code>, <code>on 10th of every month</code></li>
            <li><code>every 23 May</code> (yearly)</li>
            <li><code>every 2nd tue</code>, <code>every other tue</code></li>
            <li><code>first sat of every month</code></li>
            <li><code>every 6 months</code>, optionally <code>starting mon</code> or <code>starting in 15 days</code></li>
          </ul>
          <p>Recurring tasks show a special icon. Completing one creates the next occurrence automatically.</p>
        </section>

        <section>
          <h2>Updating tasks</h2>
          <ul>
            <li><strong>Click a task</strong> to open the <strong>Update Task</strong> panel on the left (same layout as Create Task, with current values). The title is focused so you can edit immediately.</li>
            <li>You can change all fields and save. The same title shortcuts (date, time, priority, project, reminder, tags) work when editing the title.</li>
            <li><strong>Delete</strong> — Soft delete (task is marked deleted, not removed from data).</li>
            <li>Use <strong>Undo</strong> / <strong>Redo</strong> in the header to revert or re-apply changes (including completion and deletion). The reverted task is briefly highlighted.</li>
          </ul>
        </section>

        <section>
          <h2>Projects</h2>
          <ul>
            <li><strong>Projects</strong> are listed in the left panel under Create Task. Click a project to open <strong>Project View</strong> (tasks in that project and its sub-projects).</li>
            <li><strong>Create Project</strong> — Button in the Projects section. Double-click a project name to rename it.</li>
            <li><strong>Hierarchy</strong> — Right-click a project for <strong>Create sub project</strong>, <strong>Move under project</strong>, or <strong>Move out</strong>. Use <strong>Ctrl + Up/Down</strong> to reorder projects. Two projects cannot have the same name.</li>
            <li>Add tasks to a project by: (1) opening the project and creating a task there, (2) using <code>#ProjectName</code> in the title, or (3) dragging a task onto a project in the sidebar.</li>
            <li>In All Tasks, the project name appears as a pill on each task (shortened if long). Right-click a task → <strong>Project</strong> to open that task&apos;s project view (disabled if the task has no project).</li>
          </ul>
        </section>

        <section>
          <h2>Tags</h2>
          <ul>
            <li>The <strong>Tags</strong> list is below Projects in the left panel. Click a tag to see all tasks with that tag.</li>
            <li>Add tags in the Create/Update form or with <code>@tagname</code> at the end of the title. Tags are single words; all tag data is stored in the same tasks JSON.</li>
          </ul>
        </section>

        <section>
          <h2>Task clones</h2>
          <ul>
            <li><strong>Right-click a task → Clone</strong> to create a clone. The clone is linked to the original (and vice versa); there is no master—all clones stay in sync.</li>
            <li>If you mark one clone done, all clones are marked done. Changing notes, date, time, recurrence, or priority updates all clones. If you <strong>rename</strong> a clone differently, it becomes independent.</li>
            <li>Clones show a small icon. <strong>Right-click → Un-clone</strong> to detach a task from its clone group.</li>
          </ul>
        </section>

        <section>
          <h2>Reminders</h2>
          <ul>
            <li>In Create/Update Task you can set a <strong>Reminder</strong>: either <strong>At date &amp; time</strong> (before the task is due) or <strong>Before due</strong> (e.g. 10 mins, 1 hour, 1 day before).</li>
            <li>When a reminder is due and you open the app, a <strong>Reminders</strong> section appears at the top (expanded by default). You can <strong>acknowledge</strong> or <strong>snooze</strong> (by hours or days, up to the hour before the task is due) for each reminder.</li>
          </ul>
        </section>

        <section>
          <h2>Selecting multiple tasks</h2>
          <p>Enable the checkbox mode (toggle in the task list), then select tasks. The bulk bar lets you:</p>
          <ul>
            <li><strong>Delete</strong> — Soft-delete all selected tasks.</li>
            <li><strong>Change priority</strong> — Set the same priority for all.</li>
            <li><strong>Add to project</strong> — Choose or create a project; tasks already in a project will be moved (you&apos;ll see a warning).</li>
            <li><strong>Apply tag</strong> — Add the chosen tag to all selected tasks (new tag if needed).</li>
          </ul>
        </section>

        <section>
          <h2>Sync with Google Drive</h2>
          <ul>
            <li>Click <strong>Sync to Drive</strong> to sign in with Google (OAuth). The app uses the <code>drive.file</code> scope and keeps task JSON in a folder named <strong>Niyamit</strong> in your Drive.</li>
            <li>Sync is <strong>batched</strong>: after you stop interacting for 15 seconds, changes are synced. While idle, sync runs every minute. If you make changes during a sync, they are merged when the sync finishes; if automatic merge isn&apos;t possible, you get a <strong>conflict</strong> dialog to choose local or Drive version per task.</li>
            <li>
              A <strong>colored dot</strong> next to Help shows sync state: <strong>green</strong> (synced), <strong>orange</strong> blinking slowly (sync pending), <strong>yellow</strong> blinking (syncing), or <strong>red</strong> blinking (sync error).
            </li>
            <li>If you try to close the tab or browser while sync has failed or is pending, you&apos;ll get a warning and can cancel to sync first.</li>
          </ul>
        </section>

        <section>
          <h2>Export and backup</h2>
          <p>
            <strong>Export as JSON</strong> in the header downloads a JSON file of your tasks (and projects) for backup.
            <strong> Import JSON</strong> replaces local data with a chosen file if it matches the export format (invalid files are rejected and nothing changes). Data is also stored in your browser&apos;s local storage and, when connected, in Google Drive.
            On narrow screens, both actions are under a single <strong>JSON</strong> button.
          </p>
        </section>

        <section>
          <h2>Right-click on a task</h2>
          <ul>
            <li><strong>Clone</strong> — Create a linked clone.</li>
            <li><strong>Delete</strong> — Soft-delete the task.</li>
            <li><strong>Project</strong> — Open the project view for this task&apos;s project (disabled if the task has no project).</li>
          </ul>
        </section>
      </div>
    </div>
  );
};
