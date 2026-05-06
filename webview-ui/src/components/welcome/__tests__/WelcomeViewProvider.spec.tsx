// npx vitest src/components/welcome/__tests__/WelcomeViewProvider.spec.tsx

import { render, screen, fireEvent } from "@/utils/test-utils"

import * as ExtensionStateContext from "@src/context/ExtensionStateContext"
const { ExtensionStateContextProvider } = ExtensionStateContext

import WelcomeViewProvider from "../WelcomeViewProvider"
import { vscode } from "@src/utils/vscode"

// Mock VSCode components
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeLink: ({ children, onClick }: any) => (
		<button onClick={onClick} data-testid="vscode-link">
			{children}
		</button>
	),
	VSCodeProgressRing: () => <div data-testid="progress-ring">Loading...</div>,
	VSCodeTextField: ({ value, onKeyUp, placeholder }: any) => (
		<input data-testid="text-field" type="text" value={value} onChange={onKeyUp} placeholder={placeholder} />
	),
	VSCodeRadioGroup: ({ children, value, _onChange }: any) => (
		<div data-testid="radio-group" data-value={value}>
			{children}
		</div>
	),
	VSCodeRadio: ({ children, value, onClick }: any) => (
		<div data-testid={`radio-${value}`} data-value={value} onClick={onClick}>
			{children}
		</div>
	),
}))

// Mock Button component
vi.mock("@src/components/ui", () => ({
	Button: ({ children, onClick, variant }: any) => (
		<button onClick={onClick} data-testid={`button-${variant}`}>
			{children}
		</button>
	),
}))

// Mock ApiOptions
vi.mock("../../settings/ApiOptions", () => ({
	default: () => <div data-testid="api-options">API Options Component</div>,
}))

// Mock Tab components
vi.mock("../../common/Tab", () => ({
	Tab: ({ children }: any) => <div data-testid="tab">{children}</div>,
	TabContent: ({ children }: any) => <div data-testid="tab-content">{children}</div>,
}))

// Mock RooHero
vi.mock("../RooHero", () => ({
	default: () => <div data-testid="roo-hero">Roo Hero</div>,
}))

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
	ArrowLeft: () => <span data-testid="arrow-left-icon">←</span>,
	ArrowRight: () => <span data-testid="arrow-right-icon">→</span>,
	BadgeInfo: () => <span data-testid="badge-info-icon">ℹ</span>,
	Brain: () => <span data-testid="brain-icon">🧠</span>,
	TriangleAlert: () => <span data-testid="triangle-alert-icon">⚠</span>,
}))

// Mock vscode utility
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock react-i18next
vi.mock("react-i18next", () => ({
	Trans: ({ i18nKey, children }: any) => <span data-testid={`trans-${i18nKey}`}>{children || i18nKey}</span>,
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
}))

// Mock the translation hook
vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Mock buildDocLink
vi.mock("@/utils/docLinks", () => ({
	buildDocLink: (path: string, source: string) => `https://docs.roocode.com/${path}?utm_source=${source}`,
}))

const renderWelcomeViewProvider = (extensionState = {}) => {
	const useExtensionStateMock = vi.spyOn(ExtensionStateContext, "useExtensionState")
	useExtensionStateMock.mockReturnValue({
		apiConfiguration: {},
		currentApiConfigName: "default",
		setApiConfiguration: vi.fn(),
		uriScheme: "vscode",
		cloudIsAuthenticated: false,
		...extensionState,
	} as any)

	render(
		<ExtensionStateContextProvider>
			<WelcomeViewProvider />
		</ExtensionStateContextProvider>,
	)

	return useExtensionStateMock
}

describe("WelcomeViewProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("3rd-party provider only (Router hidden)", () => {
		it("renders 3rd-party signup without Router option or radios", () => {
			renderWelcomeViewProvider()

			expect(screen.getByText("welcome:providerSignup.useAnotherProvider")).toBeInTheDocument()
			expect(screen.getByText("welcome:providerSignup.useAnotherProviderDescription")).toBeInTheDocument()
			expect(screen.getByTestId("api-options")).toBeInTheDocument()
			expect(screen.queryByTestId("radio-group")).not.toBeInTheDocument()
			expect(screen.queryByTestId("radio-roo")).not.toBeInTheDocument()
			expect(screen.queryByText(/welcome:providerSignup.rooCloudProvider/)).not.toBeInTheDocument()
			expect(screen.queryByText(/welcome:landing.greeting/)).not.toBeInTheDocument()
		})

		it("shows import settings link", () => {
			renderWelcomeViewProvider()
			expect(screen.getByText("welcome:importSettings")).toBeInTheDocument()
		})

		it("shows provider signup heading and choose provider copy", () => {
			renderWelcomeViewProvider()
			expect(screen.getByText("welcome:providerSignup.heading")).toBeInTheDocument()
			expect(screen.getByTestId("trans-welcome:providerSignup.chooseProvider")).toBeInTheDocument()
		})
	})

	describe("Finish (3rd-party)", () => {
		it("posts upsert when Finish is clicked and validation passes", () => {
			renderWelcomeViewProvider({
				apiConfiguration: { apiProvider: "openai", openAiApiKey: "sk-test" },
			})

			const finishButton = screen.getByTestId("button-primary")
			fireEvent.click(finishButton)

			expect(vscode.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "upsertApiConfiguration",
					text: "default",
				}),
			)
		})
	})

	describe("Auth In Progress State", () => {
		it("is not entered from Finish on default empty config (validation fails)", () => {
			renderWelcomeViewProvider()

			const finishButton = screen.getByTestId("button-primary")
			fireEvent.click(finishButton)

			expect(screen.queryByTestId("progress-ring")).not.toBeInTheDocument()
		})
	})
})
