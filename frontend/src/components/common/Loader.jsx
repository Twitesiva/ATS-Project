const SIZE_MAP = {
  small: 20,
  medium: 32,
  large: 44,
};

export default function Loader({ size = "medium", text = "Loading..." }) {
  const spinnerSize = SIZE_MAP[size] || SIZE_MAP.medium;
  const borderWidth = Math.max(2, Math.round(spinnerSize / 8));

  return (
    <div style={styles.container} role="status" aria-live="polite" aria-busy="true">
      <style>{`
        @keyframes loader-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      <div
        style={{
          ...styles.spinner,
          width: spinnerSize,
          height: spinnerSize,
          borderWidth,
        }}
      />

      {text ? <p style={styles.text}>{text}</p> : null}
    </div>
  );
}

const styles = {
  container: {
    width: "100%",
    height: "100%",
    minHeight: "120px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: "10px",
  },
  spinner: {
    borderRadius: "50%",
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    borderTopColor: "#2563eb",
    animation: "loader-spin 0.75s linear infinite",
    boxSizing: "border-box",
  },
  text: {
    margin: 0,
    color: "#475569",
    fontSize: "14px",
    fontWeight: 500,
  },
};
