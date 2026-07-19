// 支付模块 DTO
// 易支付回调参数由 PaymentService 直接处理（form 表单 / query string），无需额外 DTO 校验。
// 用户发起支付由 OrderService.payOrderWithEpay / payWithBalance 处理，参数来自订单 ID。
export {};
