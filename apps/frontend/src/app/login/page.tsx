'use client';

import type { FormEvent } from 'react';

import {
  Alert,
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Link,
  Spinner,
  TextField,
} from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PasswordField } from '@/components/PasswordField';
import { ApiError, loginUser } from '@/lib/api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const { accessToken } = await loginUser({ email, password });
      localStorage.setItem('accessToken', accessToken);
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title render={(props) => <h1 {...props} />}>Welcome back</Card.Title>
          <Card.Description>Sign in to join or host a meeting.</Card.Description>
        </Card.Header>

        <Form onSubmit={handleSubmit}>
          <Card.Content>
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
                name="email"
                type="email"
                validate={(value) =>
                  EMAIL_PATTERN.test(value) ? null : 'Enter a valid email address'
                }
                value={email}
                onChange={setEmail}
              >
                <Label>Email</Label>
                <Input autoComplete="email" placeholder="you@example.com" variant="secondary" />
                <FieldError />
              </TextField>

              <PasswordField
                isRequired
                autoComplete="current-password"
                label="Password"
                name="password"
                placeholder="Enter your password"
                validate={(value) => (value ? null : 'Enter your password')}
                value={password}
                onChange={setPassword}
              />
            </div>
          </Card.Content>

          <Card.Footer className="mt-2 flex flex-col gap-3">
            <Button className="w-full" isPending={isPending} type="submit">
              {isPending ? <Spinner color="current" size="sm" /> : null}
              Sign in
            </Button>
            <p className="text-center text-sm text-muted">
              Don&apos;t have an account? <Link href="/register">Create one</Link>
            </p>
          </Card.Footer>
        </Form>
      </Card>
    </div>
  );
}
