const { CartProduct } = require('../models/cart_product');
const { Category } = require('../models/category');
const { OrderItem } = require('../models/order_item');
const { Order } = require('../models/order');
const { Review } = require('../models/review');
const { User } = require('../models/user');
const { Token } = require('../models/token');
const util = require('util');
const media_helper = require('../helpers/media_helper');
const { Product } = require('../models/product');
const multer = require('multer');
const mongoose = require('mongoose');
// exports.getProducts = async (req, res) => {
//   try {
//     // Query parameters
//     const { 
//       category, 
//       name, 
//       minPrice, 
//       maxPrice, 
//       isFeatured, 
//       sortBy, 
//       sortOrder = 'asc', 
//       page = 1, 
//       limit = 10 
//     } = req.query;

//     // Build the filter object
//     const filter = { markedForDeletion: { $ne: true } };
    
//     if (category) {
//       filter.category = category;
//     }
    
//     if (name) {
//       filter.name = { $regex: name, $options: 'i' }; // Case-insensitive search
//     }
    
//     if (minPrice || maxPrice) {
//       filter.price = {};
//       if (minPrice) filter.price.$gte = Number(minPrice);
//       if (maxPrice) filter.price.$lte = Number(maxPrice);
//     }
    
//     if (isFeatured) {
//       filter.isFeatured = isFeatured === 'true';
//     }

//     // Build the sort object
//     const sort = {};
//     if (sortBy) {
//       sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
//     }

//     // Calculate pagination
//     const skip = (page - 1) * limit;
//     const total = await Product.countDocuments(filter);

//     // Get products with optional population of category
//     const products = await Product.find(filter)
//       .populate('category', 'name icon colour')
//       .sort(sort)
//       .skip(skip)
//       .limit(Number(limit));

//     if (!products || products.length === 0) {
//       return res.status(404).json({ message: 'No products found' });
//     }

//     return res.json({
//       products,
//       total,
//       page: Number(page),
//       pages: Math.ceil(total / limit),
//       limit: Number(limit)
//     });

//   } catch (err) {
//     return res.status(500).json({ type: err.name, message: err.message });
//   }
// };

exports.getProducts = async (req, res) => {
  try {
    let products;
    const page = req.query.page || 1;
    const pageSize = 10;

    products = await Product.find()
      .sort({ dateAdded: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate('category', 'name colour');

    if (!products) {
      return res.status(404).json({ message: 'Products not found' });
    }
    console.log("products ", products[0]);
    return res.json(products);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.getUserCount = async (_, res) => {
  try {
    const userCount = await User.countDocuments();
    if (!userCount) {
      return res.status(500).json({ message: 'Could not count users' });
    }
    return res.json({ userCount });
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Remove user's orders and associated order items
    const orders = await Order.find({ user: userId });

    // Extract order item IDs from all orders
    const orderItemIds = orders.flatMap((order) => order.orderItems);

    // Remove user's cart products
    await CartProduct.deleteMany({ _id: { $in: user.cart } });

    // Remove references to cart products from the user document
    await User.findByIdAndUpdate(userId, {
      $pull: { cartProducts: { $exists: true } },
    });

    // Remove user's reviews
    // await Review.deleteMany({ user: userId });

    // Remove user's orders and associated order items
    await Order.deleteMany({ user: userId });

    // Remove all order items associated with the user
    await OrderItem.deleteMany({ _id: { $in: orderItemIds } });

    await Token.deleteOne({ userId: userId });

    // Finally, remove the user
    const deletedUser = await User.deleteOne({ _id: userId });

    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

// CATEGORY

exports.addCategory = async (req, res) => {
  try {
    const imageUpload = util.promisify(
      media_helper.upload.fields([{ name: 'image', maxCount: 1 }])
    );

    try {
      await imageUpload(req, res);
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        type: err.code,
        message: `${err.message}{${err.field}}`,
        storageErrors: err.storageErrors,
      });
    }

    const image = req.files['image'][0];
    if (!image) return res.status(404).json({ message: 'No file found' });
    // this will fetch the filename from our setup at the top
    req.body['image'] = `${req.protocol}://${req.get('host')}/${image.path}`;
    let category = new Category(req.body);

    category = await category.save();
    if (!category)
      return res
        .status(500)
        .json({ message: 'The category could not be created' });

    res.status(201).json(category);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.editCategory = async (req, res) => {
  try {
    const { name, icon, colour } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, icon, colour },
      { new: true }
    );
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    category.markedForDeletion = true;
    await category.save();
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

// ORDER

exports.getOrders = async (_, res) => {
  try {
    const orders = await Order.find()
      .select('-statusHistory')
      .populate('user', 'name email')
      // newest to oldest
      .sort({ dateOrdered: -1 })
      // oldest to newest is by default.... .sort('dateOrdered')
      .populate({
        path: 'orderItems',
        populate: {
          path: 'product',
          select: 'name',
          populate: { path: 'category', select: 'name' },
        },
      });
    if (!orders) {
      return res.status(404).json({ message: 'Product not found' });
    }
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.getOrdersCount = async (_, res) => {
  try {
    const count = await Order.countDocuments();
    if (!count) {
      return res.status(500).json({ message: 'Could not count orders' });
    }

    return res.json({ count });
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.changeOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const newStatus = req.body.status; // Assuming the new status is in the request body

    let order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const statusTransitions = {
      pending: ['processed', 'cancelled', 'expired'],
      processed: ['shipped', 'cancelled', 'on-hold'],
      shipped: ['out-for-delivery', 'cancelled', 'on-hold'],
      'out-for-delivery': ['delivered', 'cancelled'],
      'on-hold': ['cancelled', 'shipped', 'out-for-delivery'],
      // No further transitions for cancelled orders
      // No further transitions for expired orders
      // No further transitions for delivered orders....You could add refund and return system if you want
    };

    // Check if the requested status is valid and allowed
    if (
      order.status !== newStatus &&
      statusTransitions[order.status] &&
      statusTransitions[order.status].includes(newStatus)
    ) {
      // Add the old status to the statusHistory
      // You should probably add the new status to history, with the added date, then when fetching always fetch the statusHistory minus the last one
      // this way, you have better tracking of the time a status changed
      if (!order.statusHistory.includes(order.status)) {
        order.statusHistory.push(order.status);
      }

      // Update the order status
      order.status = newStatus;

      // Save the updated order
      order = await order.save();

      return res.json(order);
    } else {
      return res.status(400).json({
        message: `Invalid status update\nStatus cannot go directly from ${order.status} to ${newStatus}`,
        possibleStatuses: statusTransitions[order.status],
      });
    }
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    for (const orderItemId of order.orderItems) {
      await OrderItem.findByIdAndDelete(orderItemId);
    }
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

// PRODUCT

exports.getProductsCount = async (req, res) => {
  try {
    const productCount = await Product.countDocuments();
    if (!productCount) {
      return res.status(500).json({ message: 'Could not count products' });
    }
    return res.json({ productCount });
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.addProduct = async (req, res) => {
  try {
    // always make sure to call your middleware first since we aren't putting it directly in the router's arguments
    const imagesUpload = util.promisify(
      media_helper.upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'images', maxCount: 10 },
      ])
    );

    try {
      await imagesUpload(req, res);
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        type: err.code,
        message: `${err.message}{${err.field}}`,
        storageErrors: err.storageErrors,
      });
    }

    const category = await Category.findById(req.body.category);
    if (!category) return res.status(404).json({ message: 'Invalid Category' });
    if (category.markedForDeletion) {
      return res
        .status(404)
        .json({
          message:
            'Category marked for deletion, you cannot add products to this category',
        });
    }
    const image = req.files['image'][0];
    if (!image) return res.status(404).json({ message: 'No file found' });
    // this will fetch the filename from our setup at the top
    req.body['image'] = `${req.protocol}://${req.get('host')}/${image.path}`;

    const gallery = req.files['images'];
    const imagePaths = [];
    if (gallery && gallery.length > 0) {
      for (const image of gallery) {
        const imagePath = `${req.protocol}://${req.get('host')}/${image.path}`;
        imagePaths.push(imagePath);
      }
    }

    if (imagePaths.length > 0) {
      req.body['images'] = imagePaths;
    }

    let product = new Product(req.body);
    product = await product.save();
    if (!product) {
      return res
        .status(500)
        .json({ message: 'The product could not be created' });
    }
    return res.status(201).json(product);
  } catch (err) {
    if (err instanceof multer.MulterError) {
      return res.status(err.code).json({ message: err.message });
    } else if (err) {
      return res.status(500).json({ type: err.name, message: err.message });
    }
    return res.status(500).json({ message: err.message, type: err.name });
  }
};

exports.editProduct = async (req, res) => {
  try {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !(await Product.findById(req.params.id))
    ) {
      return res.status(404).json({ message: 'Invalid Product' });
    }
    if (req.body.category) {
      const category = await Category.findById(req.body.category);
      if (!category)
        return res.status(404).json({ message: 'Invalid Category' });
    }

    const product = await Product.findById(req.params.id);

    const limit = 10 - product.images.length;
    const galleryUpload = util.promisify(
      media_helper.upload.fields([{ name: 'images', maxCount: limit }])
    );
    try {
      await galleryUpload(req, res);
    } catch (err) {
      console.error('ERROR: ', err);
      return res.status(500).json({
        type: err.code,
        message: `${err.message}{${err.field}}`,
        storageErrors: err.storageErrors,
      });
    }
    const imageFiles = req.files['images'];
    const galleryUpdate = imageFiles && imageFiles.length > 0;
    if (galleryUpdate) {
      const images = req.files['images'];
      const imagePaths = [];
      for (const image of images) {
        const imagePath = `${req.protocol}://${req.get('host')}/${image.path}`;
        imagePaths.push(imagePath);
      }
      req.body['images'] = [...product.images, ...imagePaths];
    }
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true }
    );
    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }
    return res.json(updatedProduct);
  } catch (err) {
    if (err instanceof multer.MulterError) {
      return res.status(err.code).json({ message: err.message });
    } else if (err) {
      return res.status(500).json({ type: err.name, message: err.message });
    }
    return res.status(500).json({ message: err.message });
  }
};

exports.deleteProductImages = async (req, res) => {
  try {
    const productId = req.params.id;
    const { deletedImageURLs } = req.body;

    // Validate productId and deletedImageURLs
    if (
      !mongoose.isValidObjectId(productId) ||
      !Array.isArray(deletedImageURLs)
    ) {
      return res.status(400).json({ message: 'Invalid request data' });
    }

    // Delete the images
    await media_helper.deleteImages(deletedImageURLs);
    const product = await Product.findById(req.params.id);

    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Remove deleted images from the product.images array
    product.images = product.images.filter(
      (image) => !deletedImageURLs.includes(image)
    );

    // Save the updated product
    await product.save();

    return res.status(204).end(); // 204 No Content for a successful deletion
  } catch (error) {
    console.error(`Error deleting product: ${error.message}`);
    // Handle file not found explicitly
    if (error.code === 'ENOENT') {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Handle other errors
    console.error(`Error deleting image: ${error.message}`);
    return res.status(500).json({ message: error.message });
  }
};

// Function to delete a product and its related data
exports.deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(404).json({ message: 'Invalid Product' });
    }

    // Find the product to get related data
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Delete related images
    await media_helper.deleteImages(
      [...product.images, product.image],
      'ENOENT'
    );

    // Delete associated reviews
    await Review.deleteMany({ _id: { $in: product.reviews } });

    // Delete the product
    await Product.findByIdAndDelete(productId);

    return res.status(204).end(); // 204 No Content for a successful deletion
  } catch (error) {
    console.error(`Error deleting product: ${error.message}`);
    return res.status(500).json({ message: error.message });
  }
};
