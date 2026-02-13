import React from 'react';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';

const dummyProducts = [
  {
    id: 1,
    name: "Ethiopian Yirgacheffe",
    description: "Bright and floral with notes of citrus.",
    price: "18.00",
    imageUrl: "https://source.unsplash.com/400x400/?coffee,ethiopian",
  },
  {
    id: 2,
    name: "Colombian Supremo",
    description: "Smooth and balanced with nutty undertones.",
    price: "16.50",
    imageUrl: "https://source.unsplash.com/400x400/?coffee,colombian",
  },
  {
    id: 3,
    name: "Sumatra Mandheling",
    description: "Earthy and full-bodied with a hint of chocolate.",
    price: "19.00",
    imageUrl: "https://source.unsplash.com/400x400/?coffee,sumatra",
  },
  {
    id: 4,
    name: "Brazilian Santos",
    description: "Sweet and low-acid with a creamy finish.",
    price: "15.00",
    imageUrl: "https://source.unsplash.com/400x400/?coffee,brazilian",
  },
];

const ProductsPage = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-10 text-gray-800">Our Sustainable Coffees</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {dummyProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default ProductsPage;
