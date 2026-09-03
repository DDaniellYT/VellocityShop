import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ProductCard from "./ProductCard.jsx";

export default function SortableProductCard({ product, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ProductCard product={product} dragHandleProps={{ ...attributes, ...listeners }} {...rest} />
    </div>
  );
}