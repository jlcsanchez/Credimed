"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  withArrow?: boolean;
};

export function PrimaryButton({ children, withArrow = true, ...rest }: Props) {
  return (
    <button className="btn-primary" {...rest}>
      <span>{children}</span>
      {withArrow && <span className="arrow">→</span>}
    </button>
  );
}
