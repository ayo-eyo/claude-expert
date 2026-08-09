'use client';

import type { ReactNode } from 'react';

import { Button, Description, FieldError, InputGroup, Label, TextField } from '@heroui/react';
import { useState } from 'react';

import { EyeIcon, EyeOffIcon } from '@/components/icons';

interface PasswordFieldProps {
  name: string;
  label: string;
  placeholder: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  minLength?: number;
  description?: ReactNode;
  validate?: (value: string) => string | null;
}

export function PasswordField({
  name,
  label,
  placeholder,
  autoComplete,
  value,
  onChange,
  isRequired,
  minLength,
  description,
  validate,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <TextField
      isRequired={isRequired}
      minLength={minLength}
      name={name}
      type={isVisible ? 'text' : 'password'}
      validate={validate}
      value={value}
      onChange={onChange}
    >
      <Label>{label}</Label>
      <InputGroup variant="secondary">
        <InputGroup.Input autoComplete={autoComplete} placeholder={placeholder} />
        <InputGroup.Suffix className="pe-0">
          <Button
            isIconOnly
            aria-label={isVisible ? 'Hide password' : 'Show password'}
            size="sm"
            variant="ghost"
            onPress={() => setIsVisible((prev) => !prev)}
          >
            {isVisible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </Button>
        </InputGroup.Suffix>
      </InputGroup>
      {description ? <Description>{description}</Description> : null}
      <FieldError />
    </TextField>
  );
}
