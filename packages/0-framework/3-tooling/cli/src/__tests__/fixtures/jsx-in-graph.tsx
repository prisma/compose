// Real JSX syntax — the point of this fixture. Not imported directly by any
// test; `jsx-in-graph.ts` re-exports it, so the load failure is transitive,
// matching the real-world case (a service importing a react-email template).
export const Widget = () => <div>hi</div>;
