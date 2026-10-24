import PageHeader from './PageHeader.jsx';

/**
 * The one page layout of the app: a fixed top bar (breadcrumb, title, actions) and a scrolling body below it,
 * with the same padding and spacing everywhere. Every page renders inside <Page>.
 *
 *   <Page icon={Factory} title="Production Order" subtitle="..." actions={<Button>Add new</Button>}>
 *     <Section title="Order">...</Section>
 *   </Page>
 *
 * The body fills the space beside the sidebar. `width="narrow"` centres a message-style page.
 */
export default function Page({ icon, title, subtitle, actions, width = 'default', children }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader icon={icon} title={title} subtitle={subtitle}>
        {actions}
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={`animate-page w-full space-y-4 p-4 sm:p-6 ${width === 'narrow' ? 'mx-auto max-w-3xl' : ''}`}>{children}</div>
      </div>
    </div>
  );
}
