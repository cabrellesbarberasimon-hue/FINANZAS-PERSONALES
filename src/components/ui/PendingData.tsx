/**
 * Marcador obligatorio cuando falta información para un cálculo (requisito §42):
 * nunca se estima ni se muestra 0 en su lugar.
 */
export function PendingData({ reason }: { reason?: string }) {
  return (
    <span className="text-sm font-medium text-warning" title={reason}>
      Pendiente de datos
    </span>
  );
}
