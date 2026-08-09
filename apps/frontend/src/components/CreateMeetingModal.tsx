'use client';

import type { FormEvent } from 'react';

import {
  Alert,
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
} from '@heroui/react';
import { useState } from 'react';

import { ApiError, createMeeting, type MeetingResponse } from '@/lib/api';

function toLocalDateTimeInputMin(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

interface CreateMeetingModalProps {
  isOpen: boolean;
  token: string;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: (meeting: MeetingResponse) => void;
}

export function CreateMeetingModal({
  isOpen,
  token,
  onOpenChange,
  onCreated,
}: CreateMeetingModalProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const resetForm = () => {
    setTitle('');
    setDate('');
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const meeting = await createMeeting(token, {
        title,
        date: new Date(date).toISOString(),
        participants: [],
      });
      onCreated(meeting);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetForm();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[420px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Create meeting</Modal.Heading>
          </Modal.Header>

          <Form onSubmit={handleSubmit}>
            <Modal.Body>
              <div className="flex flex-col gap-4">
                {error ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}

                <TextField
                  isRequired
                  name="title"
                  validate={(value) => (value.trim() ? null : 'Enter a meeting title')}
                  value={title}
                  onChange={setTitle}
                >
                  <Label>Title</Label>
                  <Input autoFocus placeholder="Weekly sync" variant="secondary" />
                  <FieldError />
                </TextField>

                <TextField
                  isRequired
                  name="date"
                  type="datetime-local"
                  validate={(value) => (value ? null : 'Choose a date and time')}
                  value={date}
                  onChange={setDate}
                >
                  <Label>Date & time</Label>
                  <Input min={toLocalDateTimeInputMin()} variant="secondary" />
                  <FieldError />
                </TextField>
              </div>
            </Modal.Body>

            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
              <Button isPending={isPending} type="submit">
                {isPending ? <Spinner color="current" size="sm" /> : null}
                Create meeting
              </Button>
            </Modal.Footer>
          </Form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
