import { useSettings } from '../context/SettingsContext.jsx';

// /sports: shows "Sports - Coming Soon" only when Sports is disabled (0).
// When enabled (1) the page is blank, ready for the real sports build.
export default function SportsPage() {
  const { sports } = useSettings();
  return (
    <>
      {!sports && (
        <div className="coming-soon">
          <h1>Sports</h1>
          <p>Coming soon</p>
        </div>
      )}
    </>
  );
}
