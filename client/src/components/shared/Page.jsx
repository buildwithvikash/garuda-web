import PageHeader from './PageHeader.jsx';

/**
 * The one page layout of the app: a fixed top bar (breadcrumb, title, actions) and a scrolling body below it,
 * with the same padding and spacing everywhere. Every page renders inside <Page>.
 *
 *   <Page icon={Factory} title="Production Order" subtitle="..." actions={<Button>Add new</Button>}>
 *     <Section title="Order">...</Section>
 *   </Page>
 *
 * The body fills the space beside the sidebar, with tight spacing around and between its parts (owner, 29 Oct 2026:
 * half the earlier p-4 sm:p-6 / space-y-4). `width="narrow"` centres a message-style page.
 */
export default function Page({ icon, title, subtitle, actions, width = 'default', children }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader icon={icon} title={title} subtitle={subtitle}>
        {actions}
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={`animate-page w-full space-y-2 p-2 sm:p-3 ${width === 'narrow' ? 'mx-auto max-w-3xl' : ''}`}>{children}</div>
      </div>
    </div>
  );
}
