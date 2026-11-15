import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import CustomButton from '../components/ui/CustomButton';
import Card from '../components/ui/Card';
import { useSession } from '../hooks/useSession';
import { usePageTitle } from '../hooks/usePageTitle';

const NotFoundPage: React.FC = () => {
  const { user } = useSession();
  const navigate = useNavigate();
  usePageTitle('Page not found');

  const destination = user ? '/dashboard' : '/';
  const destinationLabel = user ? 'Go to my dashboard' : 'Go to sign in';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-6">
      <Card tone="raised" className="w-full max-w-md p-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-info-container text-info">
          <Compass className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">404</p>
        <h1 className="mt-1 text-h2 font-bold text-on-surface">We couldn’t find that page</h1>
        <p className="mt-2 text-body text-on-surface-variant">
          The address may be mistyped, or the page may have moved. Your work is safe; use the
          button below to return to a page your account can open.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <CustomButton fullWidth onClick={() => navigate(destination, { replace: true })} icon={<Home className="h-4 w-4" aria-hidden />}>
            {destinationLabel}
          </CustomButton>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-11 rounded-lg text-body font-semibold text-on-surface-variant underline-offset-4 hover:text-on-surface hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Go back to the previous page
          </button>
        </div>
      </Card>
    </div>
  );
};

export default NotFoundPage;
