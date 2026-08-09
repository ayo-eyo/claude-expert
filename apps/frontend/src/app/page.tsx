'use client';

import { useEffect, useMemo, useState } from 'react';

import { Alert, Button, Card, Chip, Spinner } from '@heroui/react';
import { useRouter } from 'next/navigation';

import { CreateMeetingModal } from '@/components/CreateMeetingModal';
import { LogOutIcon, PlusIcon, UsersIcon, VideoIcon } from '@/components/icons';
import { ApiError, getMeetings, type MeetingResponse } from '@/lib/api';
import { clearAccessToken, decodeAccessToken, getAccessToken } from '@/lib/auth';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default function Home() {
  const router = useRouter();
  const [{ token, email }] = useState(() => {
    const storedToken = getAccessToken();
    const user = storedToken ? decodeAccessToken(storedToken) : null;
    return user ? { token: storedToken, email: user.email } : { token: null, email: null };
  });
  const [now] = useState(() => Date.now());
  const [meetings, setMeetings] = useState<MeetingResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      clearAccessToken();
      router.replace('/login');
      return;
    }

    const activeToken = token;
    let ignore = false;

    async function fetchMeetings() {
      try {
        const data = await getMeetings(activeToken);
        if (!ignore) setMeetings(data);
      } catch (err) {
        if (ignore) return;
        if (err instanceof ApiError && err.status === 401) {
          clearAccessToken();
          router.replace('/login');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load meetings.');
        setMeetings([]);
      }
    }

    void fetchMeetings();

    return () => {
      ignore = true;
    };
  }, [token, router]);

  const upcomingMeetings = useMemo(() => {
    if (!meetings) return [];
    return meetings
      .filter((meeting) => new Date(meeting.date).getTime() >= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3);
  }, [meetings, now]);

  const handleLogout = () => {
    clearAccessToken();
    router.replace('/login');
  };

  const handleMeetingCreated = (meeting: MeetingResponse) => {
    setMeetings((prev) => (prev ? [meeting, ...prev] : [meeting]));
  };

  if (!token || meetings === null) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <VideoIcon className="size-5" />
          Video Meeting
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{email}</span>
          <Button variant="ghost" onPress={handleLogout}>
            <LogOutIcon className="size-4" />
            Log out
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
        {error ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        <section className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold">Welcome back</h1>
            <p className="text-muted">
              You have {meetings.length} meeting{meetings.length === 1 ? '' : 's'} scheduled.
            </p>
          </div>
          <Button variant="primary" onPress={() => setIsCreateOpen(true)}>
            <PlusIcon className="size-4" />
            Create meeting
          </Button>
        </section>

        <Card>
          <Card.Header>
            <Card.Title render={(props) => <h2 {...props} />}>Upcoming meetings</Card.Title>
            <Card.Description>Your three nearest scheduled meetings.</Card.Description>
          </Card.Header>
          <Card.Content>
            {upcomingMeetings.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No upcoming meetings yet. Create one to get started.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {upcomingMeetings.map((meeting) => {
                  const participantCount = meeting.participants.length;
                  return (
                    <li
                      key={meeting.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-foreground/10 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{meeting.title}</p>
                        <p className="text-sm text-muted">
                          {dateFormatter.format(new Date(meeting.date))}
                        </p>
                      </div>
                      <Chip
                        aria-label={`${participantCount} participant${participantCount === 1 ? '' : 's'}`}
                        variant="secondary"
                      >
                        <UsersIcon className="size-3.5" />
                        <Chip.Label>{participantCount}</Chip.Label>
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card.Content>
        </Card>
      </main>

      <CreateMeetingModal
        isOpen={isCreateOpen}
        token={token}
        onOpenChange={setIsCreateOpen}
        onCreated={handleMeetingCreated}
      />
    </div>
  );
}
