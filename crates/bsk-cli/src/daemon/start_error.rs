//! Recovery guidance for startup failures, preserved through anyhow contexts.

#[derive(Debug, Clone, Copy, thiserror::Error)]
pub(crate) enum DaemonStartFailure {
    #[error("automatic daemon startup is disabled (BSK_AUTO_START=0)")]
    AutoStartDisabled,
    #[cfg(any(windows, test))]
    #[error(
        "cannot start an independent Windows daemon; the host may prohibit Job Object breakaway"
    )]
    IndependentStartFailed,
}

impl DaemonStartFailure {
    pub(crate) fn hint(self) -> &'static str {
        // Both failures need an owner that can keep the daemon alive. Preserve
        // custom/server deployments instead of replacing them with local defaults.
        "With BSK_AUTO_START=0, check for an existing host task or restore the managed service \
         in its owning host environment with its original configuration. For a new local daemon, \
         run `bsk daemon start --foreground` in a managed persistent host task \
         (run_in_background=true when supported), using the same BSK_HOME and OS user. \
         Keep that task running; verify `bsk status --json` with BSK_AUTO_START=0 in a separate tool call. \
         If no persistent task is available, use `bsk daemon start` from an independent terminal."
    }
}

pub(crate) fn recovery_hint(error: &anyhow::Error) -> Option<&'static str> {
    error
        .downcast_ref::<DaemonStartFailure>()
        .map(|failure| failure.hint())
}
