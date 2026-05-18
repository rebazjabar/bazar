const { default: mongoose } = require('mongoose');
const { CartProduct } = require('../models/cart_product');
const { User } = require('../models/user');
const { Product } = require('../models/product');

exports.getUserCart = async function (req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const cartProducts = await CartProduct.find({
      _id: { $in: user.cart },
    });
    if (!cartProducts) {
      return res.status(404).json({ message: 'Cart not found' });
    }
    const cart = [];
    for (const cartProduct of cartProducts) {
      const product = await Product.findById(cartProduct.product);
      const currentCartProductData = {
        id: cartProduct._id,
        product: cartProduct.product,
        quantity: cartProduct.quantity,
        selectedSize: cartProduct.selectedSize,
        selectedColour: cartProduct.selectedColour,
        productName: cartProduct.productName,
        productImage: cartProduct.productImage,
        productPrice: cartProduct.productPrice,
      };
      if (!product) {
        // since I don't want the reserved and reservation expiry my only option here would be to manually input each field I want
        cart.push({
          ...currentCartProductData,
          productExists: false,
          productOutOfStock: false,
        });
      } else {
        currentCartProductData['productName'] = product.name;
        currentCartProductData['productImage'] = product.image;
        currentCartProductData['productPrice'] = product.price;
        if (
          !cartProduct.reserved &&
          product.countInStock < cartProduct.quantity
        ) {
          cart.push({
            ...currentCartProductData,
            productExists: true,
            productOutOfStock: true,
          });
        } else {
          cart.push({
            ...currentCartProductData,
            productExists: true,
            productOutOfStock: false,
          });
        }
      }
    }
    console.log("Cart Data: ", JSON.stringify(cart, null, 2));

    return res.json(cart);
  } catch (err) {
    console.log('ERROR OCCURRED: ', err);
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.getUserCartCount = async function (req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json(user.cart.length);
  } catch (err) {
    console.log('ERROR OCCURRED: ', err);
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.addToCart = async function (req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productId, selectedColour, selectedSize } = req.body;
    console.log(`🟢 Received Add to Cart Request - Product ID: ${productId}`);
    console.log(`🎨 Selected Colour: ${selectedColour}`);
    console.log(`📏 Selected Size: ${selectedSize}`);
    
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const userCartProducts = await CartProduct.find({
      _id: { $in: user.cart },
    });

    const existingCartItem = userCartProducts.find(
      (item) =>
        item.product.equals(new mongoose.Types.ObjectId(productId)) &&
        item.selectedSize === selectedSize &&
        item.selectedColour === selectedColour
    );

    if (existingCartItem) {
      console.log(`🛒 Product already in cart. Increasing quantity.`);

      const product = await Product.findById(productId).session(session);
      if (product.countInStock >= existingCartItem.quantity + 1) {
        existingCartItem.quantity += 1;
        await existingCartItem.save({ session });

        await Product.findOneAndUpdate(
          { _id: productId },
          { $inc: { countInStock: -1 } }
        ).session(session);

        await session.commitTransaction();
        console.log(`✅ Quantity updated. New Quantity: ${existingCartItem.quantity}`);
        return res.status(200).end();
      } else {
        session.abortTransaction();
        console.log(`❌ Out of stock!`);
        return res.status(400).json({ message: "Out of stock!" });
      }
    }

    console.log(`🆕 Product not in cart. Adding new entry.`);
    const product = await Product.findById(productId);
    if (!product) {
      console.log(`❌ Product not found!`);
      return res.status(404).json({ message: "Product not found" });
    }

    const cartProduct = await new CartProduct({
      ...req.body,
      product: productId,
      productName: product.name,
      productImage: product.image,
      productPrice: product.price,
      reserved: true,
    }).save({ session });

    console.log(`✅ Added to cart: ${cartProduct.id}`);

    user.cart.push(cartProduct.id);
    await user.save({ session });

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: productId, countInStock: { $gte: cartProduct.quantity } },
      { $inc: { countInStock: -cartProduct.quantity } },
      { new: true, session }
    );

    if (!updatedProduct) {
      session.abortTransaction();
      console.log(`❌ Insufficient stock or concurrency issue`);
      return res.status(400).json({
        message: "Insufficient stock or concurrency issue",
      });
    }

    await session.commitTransaction();
    console.log(`🛒 Cart update successful!`);
    return res.status(201).json(cartProduct);
  } catch (err) {
    console.log("🚨 ERROR OCCURRED: ", err);
    await session.abortTransaction();
    return res.status(500).json({ type: err.name, message: err.message });
  } finally {
    await session.endSession();
  }
};

exports.modifyProductQuantity = async function (req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { quantity } = req.body;
    let cartProduct = await CartProduct.findById(req.params.cartProductId);
    if (!cartProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const actualProduct = await Product.findById(cartProduct.product);

    if (!actualProduct) {
      return res.status(404).json({ message: 'Product does not exist' });
    }

    if (quantity > actualProduct.countInStock) {
      return res
        .status(400)
        .json({ message: 'Insufficient stock for the requested quantity' });
    }

    cartProduct = await CartProduct.findByIdAndUpdate(
      req.params.cartProductId,
      req.body,
      { new: true }
    );
    if (!cartProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }
    return res.json(cartProduct);
  } catch (err) {
    console.log('ERROR OCCURRED: ', err);
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.getCartProductById = async function (req, res) {
  try {
    const cartProduct = await CartProduct.findById(req.params.cartProductId);
    if (!cartProduct) {
      return res.status(404).json({ message: 'Cart Product not found!.' });
    }
    let cartProductData;
    const product = await Product.findById(cartProduct.product);
    // since I don't want the reserved and reservation expiry my only option here would be to manually input each field I want
    const currentCartProductData = {
      id: cartProduct._id,
      product: cartProduct.product,
      quantity: cartProduct.quantity,
      selectedSize: cartProduct.selectedSize,
      selectedColour: cartProduct.selectedColour,
      productName: cartProduct.productName,
      productImage: cartProduct.productImage,
      productPrice: cartProduct.productPrice,
    };
    if (!product) {
      cartProductData = {
        ...currentCartProductData,
        productExists: false,
        productOutOfStock: false,
      };
    } else {
      currentCartProductData['productName'] = product.name;
      currentCartProductData['productImage'] = product.image;
      currentCartProductData['productPrice'] = product.price;
      if (
        !cartProduct.reserved &&
        product.countInStock < cartProduct.quantity
      ) {
        cartProductData = {
          ...currentCartProductData,
          productExists: true,
          productOutOfStock: true,
        };
      } else {
        cartProductData = {
          ...currentCartProductData,
          productExists: true,
          productOutOfStock: false,
        };
      }
    }
    return res.json(cartProductData);
  } catch (err) {
    return res.status(500).json({ type: err.name, message: err.message });
  }
};

exports.removeFromCart = async function (req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.cart.includes(req.params.cartProductId)) {
      return res.status(400).json({ message: 'Product not in user cart' });
    }
    // Find the cart item to be removed
    const cartItemToRemove = await CartProduct.findById(
      req.params.cartProductId
    );

    if (!cartItemToRemove) {
      // If the cart item doesn't exist, return a 404 status
      return res.status(404).json({ message: 'Cart item not found' });
    }

    if (cartItemToRemove.reserved) {
      // Increment countInStock and save, handling concurrency
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: cartItemToRemove.product },
        { $inc: { countInStock: cartItemToRemove.quantity } },
        { new: true } // Return the updated document
      );

      if (!updatedProduct) {
        console.error(
          'Failed to update product stock due to concurrency issues'
        );
        // Handle concurrency issues
        return res.status(500).json({ message: 'Internal Server Error' });
      }
    }

    // Remove the cart item from the user's cart
    user.cart.pull(cartItemToRemove.id);
    await user.save();

    // Remove the cart item from the database
    const cartProduct = await CartProduct.findByIdAndDelete(
      cartItemToRemove.id
    );
    if (!cartProduct) {
      return res.status(404).json({ message: 'Item not found' });
    }
    return res.status(204).json({ message: 'Cart item removed successfully' });
  } catch (err) {
    console.error('ERROR OCCURRED: ', err);
    return res.status(500).json({ type: err.name, message: err.message });
  }
};
