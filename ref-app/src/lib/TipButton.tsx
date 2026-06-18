import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * A button wrapped in an instant CSS tooltip (see `.tip` / `.tip-body` in
 * App.css). The tip shows on hover with no native-`title` delay and works even
 * when the button is disabled (the wrapping span receives the hover). Pass
 * `mono` when the tip contains a command or address that reads better in
 * monospace.
 */
export function TipButton({
    tip,
    mono,
    children,
    ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & { tip: ReactNode; mono?: boolean }) {
    return (
        <span className="tip">
            <button {...buttonProps}>{children}</button>
            <span className={mono ? "tip-body mono" : "tip-body"}>{tip}</span>
        </span>
    );
}
