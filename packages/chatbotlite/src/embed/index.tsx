// Vanilla JS embed entry — drops chatbotlite into any HTML page.
//
// Usage in plain HTML / WordPress / Webflow / Shopify / Squarespace:
//
//   <script src="https://unpkg.com/chatbotlite/dist/embed.iife.js"></script>
//   <script>
//     chatbotlite.mount({
//       endpoint: "/api/chat",
//       title: "Acme Plumbing",
//       attach: { enabled: true },
//       voice: { enabled: true }
//     });
//   </script>
//
// React is bundled inline so no host installation needed.

import { createRoot, type Root } from "react-dom/client";
import { ChatWidget, type ChatWidgetProps } from "../react/ChatWidget.js";

interface MountedInstance {
  unmount: () => void;
  update: (next: Partial<ChatWidgetProps>) => void;
}

const instances = new Map<string, { root: Root; container: HTMLElement; props: ChatWidgetProps }>();

type MountProps = ChatWidgetProps & { id?: string };

function mount(props: MountProps): MountedInstance {
  const id = props.id ?? `chatbotlite-${Math.random().toString(36).slice(2, 9)}`;
  const widgetProps = stripId(props);

  if (instances.has(id)) {
    const inst = instances.get(id)!;
    inst.props = mergeProps(inst.props, widgetProps);
    inst.root.render(<ChatWidget {...inst.props} />);
    return makeInstance(id);
  }

  const container = document.createElement("div");
  container.id = id;
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<ChatWidget {...widgetProps} />);
  instances.set(id, { root, container, props: widgetProps });
  return makeInstance(id);
}

function stripId(p: MountProps): ChatWidgetProps {
  const { id: _id, ...rest } = p;
  return rest as ChatWidgetProps;
}

function mergeProps(prev: ChatWidgetProps, next: Partial<ChatWidgetProps>): ChatWidgetProps {
  return { ...prev, ...next } as ChatWidgetProps;
}

function makeInstance(id: string): MountedInstance {
  return {
    unmount(): void {
      const inst = instances.get(id);
      if (!inst) return;
      inst.root.unmount();
      inst.container.remove();
      instances.delete(id);
    },
    update(next): void {
      const inst = instances.get(id);
      if (!inst) return;
      inst.props = mergeProps(inst.props, next);
      inst.root.render(<ChatWidget {...inst.props} />);
    }
  };
}

// Expose on window for plain <script> embed
declare global {
  interface Window {
    chatbotlite: {
      mount: typeof mount;
      version: string;
    };
  }
}

declare const __CHATBOTLITE_VERSION__: string;

if (typeof window !== "undefined") {
  window.chatbotlite = {
    mount,
    version: typeof __CHATBOTLITE_VERSION__ !== "undefined" ? __CHATBOTLITE_VERSION__ : "0.0.0-dev"
  };
}

export { mount };
export type { MountedInstance };
