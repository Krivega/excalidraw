import "./ToolIcon.scss";

import clsx from "clsx";
import type { CSSProperties } from "react";
import React, { useEffect, useRef, useState } from "react";
import type { PointerType } from "../element/types";
import { AbortError } from "../errors";
import { isPromiseLike } from "../utils";
import { useExcalidrawContainer } from "./App";
import Spinner from "./Spinner";

export type ToolButtonSize = "small" | "medium";

type ToolButtonBaseProps = {
  icon?: React.ReactNode;
  "aria-label": string;
  "aria-keyshortcuts"?: string;
  "data-testid"?: string;
  label?: string;
  title?: string;
  name?: string;
  id?: string;
  size?: ToolButtonSize;
  keyBindingLabel?: string | null;
  showAriaLabel?: boolean;
  hidden?: boolean;
  visible?: boolean;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  isLoading?: boolean;
};

type ToolButtonProps =
  | (ToolButtonBaseProps & {
      type: "button";
      children?: React.ReactNode;
      onClick?(event: React.MouseEvent): void;
    })
  | (ToolButtonBaseProps & {
      type: "submit";
      children?: React.ReactNode;
      onClick?(event: React.MouseEvent): void;
    })
  | (ToolButtonBaseProps & {
      type: "icon";
      children?: React.ReactNode;
      onClick?(): void;
    })
  | (ToolButtonBaseProps & {
      type: "radio";
      checked: boolean;
      onChange?(data: { pointerType: PointerType | null }): void;
      onPointerDown?(data: { pointerType: PointerType }): void;
    });

export const ToolButton = React.forwardRef((props: ToolButtonProps, ref) => {
  const { id: excalId } = useExcalidrawContainer();
  const innerRef = React.useRef(null);
  React.useImperativeHandle(ref, () => innerRef.current);

  // Set default values
  const {
    visible = true,
    className = "",
    size = "medium",
    ...restProps
  } = props;

  const sizeCn = `ToolIcon_size_${size}`;

  const [isLoading, setIsLoading] = useState(false);

  const isMountedRef = useRef(true);

  const onClick = async (event: React.MouseEvent) => {
    const ret = "onClick" in restProps && restProps.onClick?.(event);

    if (isPromiseLike(ret)) {
      try {
        setIsLoading(true);
        await ret;
      } catch (error: any) {
        if (!(error instanceof AbortError)) {
          throw error;
        } else {
          console.warn(error);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const lastPointerTypeRef = useRef<PointerType | null>(null);

  if (
    restProps.type === "button" ||
    restProps.type === "icon" ||
    restProps.type === "submit"
  ) {
    const type = (restProps.type === "icon" ? "button" : restProps.type) as
      | "button"
      | "submit";
    return (
      <button
        className={clsx(
          "ToolIcon_type_button",
          sizeCn,
          className,
          visible && !restProps.hidden
            ? "ToolIcon_type_button--show"
            : "ToolIcon_type_button--hide",
          {
            ToolIcon: !restProps.hidden,
            "ToolIcon--selected": restProps.selected,
            "ToolIcon--plain": restProps.type === "icon",
          },
        )}
        style={restProps.style}
        data-testid={restProps["data-testid"]}
        hidden={restProps.hidden}
        title={restProps.title}
        aria-label={restProps["aria-label"]}
        type={type}
        onClick={onClick}
        ref={innerRef}
        disabled={isLoading || restProps.isLoading || !!restProps.disabled}
      >
        {(restProps.icon || restProps.label) && (
          <div
            className="ToolIcon__icon"
            aria-hidden="true"
            aria-disabled={!!restProps.disabled}
          >
            {restProps.icon || restProps.label}
            {restProps.keyBindingLabel && (
              <span className="ToolIcon__keybinding">
                {restProps.keyBindingLabel}
              </span>
            )}
            {restProps.isLoading && <Spinner />}
          </div>
        )}
        {restProps.showAriaLabel && (
          <div className="ToolIcon__label">
            {restProps["aria-label"]} {isLoading && <Spinner />}
          </div>
        )}
        {restProps.children}
      </button>
    );
  }

  return (
    <label
      className={clsx("ToolIcon", className)}
      title={restProps.title}
      onPointerDown={(event) => {
        lastPointerTypeRef.current = event.pointerType || null;
        restProps.onPointerDown?.({ pointerType: event.pointerType || null });
      }}
      onPointerUp={() => {
        requestAnimationFrame(() => {
          lastPointerTypeRef.current = null;
        });
      }}
    >
      <input
        className={`ToolIcon_type_radio ${sizeCn}`}
        type="radio"
        name={restProps.name}
        aria-label={restProps["aria-label"]}
        aria-keyshortcuts={restProps["aria-keyshortcuts"]}
        data-testid={restProps["data-testid"]}
        id={`${excalId}-${restProps.id}`}
        onChange={() => {
          restProps.onChange?.({ pointerType: lastPointerTypeRef.current });
        }}
        checked={restProps.checked}
        ref={innerRef}
      />
      <div className="ToolIcon__icon">
        {restProps.icon}
        {restProps.keyBindingLabel && (
          <span className="ToolIcon__keybinding">
            {restProps.keyBindingLabel}
          </span>
        )}
      </div>
    </label>
  );
});

ToolButton.displayName = "ToolButton";
