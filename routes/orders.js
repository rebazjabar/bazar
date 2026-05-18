const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orders');

// router.post('/', orderController.addOrder);

router.get('/user/:userId', orderController.getUserOrders);

router.get('/:id', orderController.getOrderById);



module.exports = router;
