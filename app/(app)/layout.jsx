import ClientApp from "@/components/ClientApp";

// The map app stays mounted while moving between /, /p/[id], /settings and
// /account; those pages only provide metadata.
export default function AppLayout({ children }) {
  return (
    <>
      <ClientApp />
      {children}
    </>
  );
}
