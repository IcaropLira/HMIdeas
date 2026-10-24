// "Clicar fora" de um painel: o alvo está DENTRO de verdade (num painel/botão) ou só no espaço vazio do contêiner?
// O `.dock` ocupa a largura da barra de ferramentas, bem mais larga que o painel; as faixas vazias ao lado
// do painel pertencem ao `.dock` mas não são parte da interface, então clicar nelas tem que fechar o painel.

type Container = { contains(node: Node): boolean };

export function isInsideDock(target: Node | null, dock: Container | null): boolean {
  if (!target || !dock) return false;
  if ((target as unknown) === dock) return false; // espaço vazio do próprio contêiner
  return dock.contains(target);
}
